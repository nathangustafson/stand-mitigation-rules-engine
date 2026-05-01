def _create_property(client) -> int:
    response = client.post(
        "/api/properties",
        json={
            "street": "1 Pine St",
            "city": "Truckee",
            "state": "CA",
            "zip": "96161",
        },
    )
    assert response.status_code == 201, response.text
    return response.json()["id"]


def test_create_observation_with_brief_example_succeeds(client):
    pid = _create_property(client)
    payload = {
        "values": {
            "attic_vent_screen": "none",
            "roof_type": "class_c",
            "window_type": "single",
            "wildfire_risk_category": "d",
            "vegetation": [
                {"type": "shrub", "distance_to_window_ft": 8},
                {"type": "tree", "distance_to_window_ft": 25.5},
            ],
        }
    }
    response = client.post(f"/api/properties/{pid}/observations", json=payload)
    assert response.status_code == 201, response.text
    body = response.json()
    assert body["property_id"] == pid
    assert body["values"]["roof_type"] == "class_c"
    assert len(body["values"]["vegetation"]) == 2


def test_unknown_field_rejected(client):
    pid = _create_property(client)
    response = client.post(
        f"/api/properties/{pid}/observations",
        json={"values": {"defensible_space_ft": 30}},
    )
    assert response.status_code == 422
    detail = response.json()["detail"]
    assert any(item["key"] == "defensible_space_ft" for item in detail)


def test_invalid_enum_value_rejected(client):
    pid = _create_property(client)
    response = client.post(
        f"/api/properties/{pid}/observations",
        json={"values": {"roof_type": "class_z"}},
    )
    assert response.status_code == 422
    detail = response.json()["detail"]
    assert any(item["key"] == "roof_type" for item in detail)


def test_invalid_nested_field_rejected(client):
    pid = _create_property(client)
    response = client.post(
        f"/api/properties/{pid}/observations",
        json={"values": {"vegetation": [{"type": "tree", "distance_to_window_ft": "very close"}]}},
    )
    assert response.status_code == 422


def test_list_returns_most_recent_first(client):
    pid = _create_property(client)
    for i in range(3):
        response = client.post(
            f"/api/properties/{pid}/observations",
            json={"values": {"roof_type": "class_a"}},
        )
        assert response.status_code == 201, f"create {i} failed: {response.text}"

    listing = client.get(f"/api/properties/{pid}/observations")
    assert listing.status_code == 200
    items = listing.json()
    assert len(items) == 3
    ids = [item["id"] for item in items]
    assert ids == sorted(ids, reverse=True)


def test_observation_for_unknown_property_404(client):
    response = client.post(
        "/api/properties/9999/observations",
        json={"values": {"roof_type": "class_a"}},
    )
    assert response.status_code == 404


def test_update_observation_replaces_values(client):
    pid = _create_property(client)
    create = client.post(
        f"/api/properties/{pid}/observations",
        json={"values": {"roof_type": "class_c", "window_type": "single"}},
    )
    assert create.status_code == 201
    oid = create.json()["id"]
    captured_at = create.json()["captured_at"]

    update = client.patch(
        f"/api/properties/{pid}/observations/{oid}",
        json={"values": {"roof_type": "class_a", "wildfire_risk_category": "b"}},
    )
    assert update.status_code == 200, update.text
    body = update.json()
    assert body["values"] == {"roof_type": "class_a", "wildfire_risk_category": "b"}
    assert body["captured_at"] == captured_at  # capture time is preserved


def test_update_unknown_observation_returns_404(client):
    pid = _create_property(client)
    response = client.patch(
        f"/api/properties/{pid}/observations/9999",
        json={"values": {"roof_type": "class_a"}},
    )
    assert response.status_code == 404


def test_update_observation_validates_against_registry(client):
    pid = _create_property(client)
    create = client.post(
        f"/api/properties/{pid}/observations",
        json={"values": {"roof_type": "class_a"}},
    )
    oid = create.json()["id"]
    response = client.patch(
        f"/api/properties/{pid}/observations/{oid}",
        json={"values": {"roof_type": "class_z"}},
    )
    assert response.status_code == 422


def test_evaluate_returns_vulnerabilities_for_brief_seeded_rules(client):
    pid = _create_property(client)
    create = client.post(
        f"/api/properties/{pid}/observations",
        json={
            "values": {
                "attic_vent_screen": "none",
                "roof_type": "class_c",
                "window_type": "single",
                "wildfire_risk_category": "d",
                "home_to_home_distance_ft": 8,
                "vegetation": [{"type": "shrub", "distance_to_window_ft": 5}],
            }
        },
    )
    oid = create.json()["id"]
    response = client.post(f"/api/properties/{pid}/observations/{oid}/evaluate")
    assert response.status_code == 200, response.text
    body = response.json()
    rule_names = {v["rule_name"] for v in body["vulnerabilities"]}
    # All four seeded rules should fire on this fully-bad observation
    assert rule_names == {
        "Attic Vent ember-rated",
        "Roof class",
        "Home-to-home distance",
        "Windows safe distance",
    }
    # Bridge count is the 3 bridge mitigations from Windows; home-to-home has none.
    assert body["bridge_mitigation_count"] == 3
    # Full = 1 attic + 1 roof + 2 windows = 4 (home-to-home contributes none).
    assert len(body["full_mitigations"]) == 4


def test_evaluate_clean_observation_has_no_vulnerabilities(client):
    pid = _create_property(client)
    create = client.post(
        f"/api/properties/{pid}/observations",
        json={
            "values": {
                "attic_vent_screen": "ember_resistant",
                "roof_type": "class_a",
                "window_type": "tempered_glass",
                "wildfire_risk_category": "a",
                "home_to_home_distance_ft": 30,
                "vegetation": [{"type": "tree", "distance_to_window_ft": 100}],
            }
        },
    )
    oid = create.json()["id"]
    response = client.post(f"/api/properties/{pid}/observations/{oid}/evaluate")
    assert response.status_code == 200
    body = response.json()
    assert body["vulnerabilities"] == []
    assert body["bridge_mitigation_count"] == 0


def test_evaluate_unknown_observation_404(client):
    pid = _create_property(client)
    response = client.post(f"/api/properties/{pid}/observations/9999/evaluate")
    assert response.status_code == 404


def test_sparse_observation_merges_with_predecessors_for_evaluation(client):
    pid = _create_property(client)
    # First observation: fully bad → all four rules fire
    initial = client.post(
        f"/api/properties/{pid}/observations",
        json={
            "values": {
                "attic_vent_screen": "none",
                "roof_type": "class_c",
                "window_type": "single",
                "wildfire_risk_category": "d",
                "home_to_home_distance_ft": 8,
                "vegetation": [{"type": "shrub", "distance_to_window_ft": 5}],
            }
        },
    )
    assert initial.status_code == 201
    initial_id = initial.json()["id"]

    # Second observation: sparse — only changes attic_vent_screen.
    # The other fields should be inherited from the first observation.
    second = client.post(
        f"/api/properties/{pid}/observations",
        json={"values": {"attic_vent_screen": "ember_resistant"}},
    )
    assert second.status_code == 201, second.text
    second_id = second.json()["id"]
    assert second.json()["values"] == {"attic_vent_screen": "ember_resistant"}
    # effective_values reflect the merge
    eff = second.json()["effective_values"]
    assert eff["attic_vent_screen"] == "ember_resistant"
    assert eff["roof_type"] == "class_c"
    assert eff["window_type"] == "single"
    assert eff["home_to_home_distance_ft"] == 8

    # Evaluating the second observation uses merged effective values
    response = client.post(f"/api/properties/{pid}/observations/{second_id}/evaluate")
    body = response.json()
    rule_names = {v["rule_name"] for v in body["vulnerabilities"]}
    # Attic Vent rule no longer fires (ember_resistant satisfies it)
    assert "Attic Vent ember-rated" not in rule_names
    # Roof, Windows, and Home-to-home rules still fire because those fields
    # are inherited from the first observation.
    assert "Roof class" in rule_names
    assert "Windows safe distance" in rule_names
    assert "Home-to-home distance" in rule_names

    # First observation still evaluates against its own values
    response_initial = client.post(f"/api/properties/{pid}/observations/{initial_id}/evaluate")
    assert len(response_initial.json()["vulnerabilities"]) == 4


def test_create_with_explicit_captured_at_is_persisted(client):
    pid = _create_property(client)
    # Backdated observation — common when capturing data after the fact.
    response = client.post(
        f"/api/properties/{pid}/observations",
        json={
            "captured_at": "2024-06-01T10:00:00",
            "values": {"roof_type": "class_a"},
        },
    )
    assert response.status_code == 201, response.text
    body = response.json()
    assert body["captured_at"].startswith("2024-06-01T10:00:00")


def test_update_can_change_captured_at(client):
    pid = _create_property(client)
    create = client.post(
        f"/api/properties/{pid}/observations",
        json={"values": {"roof_type": "class_a"}},
    )
    oid = create.json()["id"]
    response = client.patch(
        f"/api/properties/{pid}/observations/{oid}",
        json={
            "captured_at": "2025-01-15T08:30:00",
            "values": {"roof_type": "class_b"},
        },
    )
    assert response.status_code == 200, response.text
    assert response.json()["captured_at"].startswith("2025-01-15T08:30:00")


def test_empty_observation_rejected(client):
    pid = _create_property(client)
    response = client.post(f"/api/properties/{pid}/observations", json={"values": {}})
    assert response.status_code == 422


def test_list_observations_includes_effective_values(client):
    pid = _create_property(client)
    client.post(
        f"/api/properties/{pid}/observations",
        json={
            "values": {
                "roof_type": "class_a",
                "window_type": "single",
            }
        },
    )
    client.post(
        f"/api/properties/{pid}/observations",
        json={"values": {"window_type": "tempered_glass"}},
    )
    response = client.get(f"/api/properties/{pid}/observations")
    assert response.status_code == 200
    items = response.json()
    # newest-first
    assert items[0]["values"] == {"window_type": "tempered_glass"}
    assert items[0]["effective_values"]["roof_type"] == "class_a"
    assert items[0]["effective_values"]["window_type"] == "tempered_glass"
    assert items[1]["values"] == {"roof_type": "class_a", "window_type": "single"}
    assert items[1]["effective_values"] == items[1]["values"]


def test_update_rejects_observation_belonging_to_other_property(client):
    pid_a = _create_property(client)
    create_b_response = client.post(
        "/api/properties",
        json={"street": "2 Maple", "city": "Reno", "state": "NV", "zip": "89501"},
    )
    pid_b = create_b_response.json()["id"]
    create = client.post(
        f"/api/properties/{pid_b}/observations",
        json={"values": {"roof_type": "class_a"}},
    )
    oid_b = create.json()["id"]

    cross = client.patch(
        f"/api/properties/{pid_a}/observations/{oid_b}",
        json={"values": {"roof_type": "class_b"}},
    )
    assert cross.status_code == 404


def test_evaluate_as_of_excludes_rules_created_after(client):
    # The four seeded rules all exist with a current `created_at`. An as_of
    # set well in the past should exclude every one of them.
    pid = _create_property(client)
    create = client.post(
        f"/api/properties/{pid}/observations",
        json={
            "values": {
                "attic_vent_screen": "none",
                "roof_type": "class_c",
                "window_type": "single",
                "wildfire_risk_category": "d",
                "home_to_home_distance_ft": 8,
                "vegetation": [{"type": "shrub", "distance_to_window_ft": 5}],
            }
        },
    )
    oid = create.json()["id"]
    response = client.post(
        f"/api/properties/{pid}/observations/{oid}/evaluate",
        params={"as_of": "2000-01-01T00:00:00"},
    )
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["evaluated_rule_count"] == 0
    assert body["vulnerabilities"] == []


def test_evaluate_as_of_accepts_tz_aware_iso_string(client):
    """Regression: the frontend sends UTC ISO strings ending in `Z` (e.g.
    `2026-04-17T06:59:59.000Z`). Stored timestamps are naive — comparing the
    two used to raise `TypeError: can't compare offset-naive and offset-aware
    datetimes` and 500. The route now strips tzinfo at the boundary."""
    pid = _create_property(client)
    create = client.post(
        f"/api/properties/{pid}/observations",
        json={"values": {"attic_vent_screen": "none"}},
    )
    oid = create.json()["id"]
    # Note the trailing `Z` — UTC marker that makes the parsed datetime aware.
    response = client.post(
        f"/api/properties/{pid}/observations/{oid}/evaluate",
        params={"as_of": "2000-01-01T00:00:00.000Z"},
    )
    assert response.status_code == 200, response.text
    # And with a +offset form, just to be safe.
    response = client.post(
        f"/api/properties/{pid}/observations/{oid}/evaluate",
        params={"as_of": "2000-01-01T00:00:00+00:00"},
    )
    assert response.status_code == 200, response.text


def test_evaluate_as_of_excludes_mitigations_created_after(client):
    pid = _create_property(client)
    create = client.post(
        f"/api/properties/{pid}/observations",
        json={
            "values": {
                "window_type": "single",
                "vegetation": [{"type": "shrub", "distance_to_window_ft": 5}],
            }
        },
    )
    oid = create.json()["id"]

    # Add a brand-new mitigation to the seeded Windows rule. It should appear
    # in a no-as_of evaluation but be filtered out by an as_of taken between
    # the seeded rule and the new mitigation.
    import time
    from datetime import datetime

    rules = client.get("/api/rules").json()
    windows = next(r for r in rules if r["name"] == "Windows safe distance")
    before_count = len(windows["mitigations"])

    # Cutoff lands after the seeded rows but before the new mitigation.
    cutoff = datetime.utcnow()
    time.sleep(0.01)

    add = client.post(
        f"/api/rules/{windows['id']}/mitigations",
        json={"tier": "bridge", "name": "fresh", "description": "new bridge"},
    )
    assert add.status_code == 201, add.text

    # Without as_of: new mitigation is included.
    full_eval = client.post(f"/api/properties/{pid}/observations/{oid}/evaluate").json()
    bridge_total = full_eval["bridge_mitigation_count"]
    full_total = len(full_eval["full_mitigations"])

    # With as_of just before the new mitigation: the new one is filtered out
    # but the rule itself (which is older) still fires.
    asof_eval = client.post(
        f"/api/properties/{pid}/observations/{oid}/evaluate",
        params={"as_of": cutoff.isoformat()},
    ).json()
    asof_rule_names = {v["rule_name"] for v in asof_eval["vulnerabilities"]}
    assert "Windows safe distance" in asof_rule_names
    # The newly-added bridge mitigation is the only one filtered out.
    assert asof_eval["bridge_mitigation_count"] == bridge_total - 1
    assert len(asof_eval["full_mitigations"]) == full_total
    # Sanity: the seeded Windows rule started with `before_count` mitigations;
    # no as_of evaluation should still see all of them in the Windows rule.
    rule_after = client.get(f"/api/rules/{windows['id']}").json()
    assert len(rule_after["mitigations"]) == before_count + 1
