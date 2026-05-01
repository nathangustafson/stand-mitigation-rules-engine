def test_seeded_rules_are_returned(client):
    response = client.get("/api/rules")
    assert response.status_code == 200
    rules = response.json()
    assert {r["type"] for r in rules} == {"boolean", "logical", "parameterized"}
    assert {r["name"] for r in rules} == {
        "Attic Vent ember-rated",
        "Roof class",
        "Home-to-home distance",
        "Windows safe distance",
    }
    windows = next(r for r in rules if r["name"] == "Windows safe distance")
    assert len(windows["mitigations"]) == 5
    tiers = sorted({m["tier"] for m in windows["mitigations"]})
    assert tiers == ["bridge", "full"]
    # Brief: Home-to-home distance is "typically an unmitigatable property
    # characteristic" — the rule has zero mitigations attached.
    h2h = next(r for r in rules if r["name"] == "Home-to-home distance")
    assert h2h["mitigations"] == []


def test_create_boolean_rule(client):
    response = client.post(
        "/api/rules",
        json={
            "name": "Vents must be ember-rated",
            "description": "All vents must be ember resistant.",
            "priority": 50,
            "body": {
                "type": "boolean",
                "field": "attic_vent_screen",
                "must_equal": "ember_resistant",
            },
            "mitigations": [{"tier": "full", "name": "Install ember vents", "description": "Replace vents."}],
        },
    )
    assert response.status_code == 201, response.text
    body = response.json()
    assert body["type"] == "boolean"
    assert body["body"]["field"] == "attic_vent_screen"
    assert len(body["mitigations"]) == 1


def test_create_logical_rule_with_nested_clauses(client):
    response = client.post(
        "/api/rules",
        json={
            "name": "Roof",
            "description": "Roof class rule",
            "priority": 80,
            "body": {
                "type": "logical",
                "clause": {
                    "type": "any_of",
                    "clauses": [
                        {"type": "equals", "field": "roof_type", "value": "class_a"},
                        {
                            "type": "all_of",
                            "clauses": [
                                {
                                    "type": "equals",
                                    "field": "wildfire_risk_category",
                                    "value": "a",
                                },
                                {
                                    "type": "in",
                                    "field": "roof_type",
                                    "values": ["class_a", "class_b"],
                                },
                            ],
                        },
                    ],
                },
            },
            "mitigations": [],
        },
    )
    assert response.status_code == 201, response.text
    body = response.json()
    assert body["body"]["clause"]["type"] == "any_of"
    assert body["body"]["clause"]["clauses"][1]["type"] == "all_of"


def test_create_parameterized_rule(client):
    response = client.post(
        "/api/rules",
        json={
            "name": "Windows",
            "description": "windows safe distance",
            "priority": 70,
            "body": {
                "type": "parameterized",
                "base": 30,
                "unit": "ft",
                "modifiers": [
                    {"when": {"field": "window_type", "equals": "single"}, "multiply_by": 3},
                ],
                "compare_field": "vegetation[].distance_to_window_ft",
                "compare_op": ">=",
            },
            "mitigations": [
                {"tier": "full", "name": "Remove vegetation", "description": "..."},
                {
                    "tier": "bridge",
                    "name": "Window film",
                    "description": "...",
                    "effect": "-20%",
                },
            ],
        },
    )
    assert response.status_code == 201, response.text
    body = response.json()
    assert body["body"]["base"] == 30
    tiers = sorted(m["tier"] for m in body["mitigations"])
    assert tiers == ["bridge", "full"]


def test_invalid_clause_type_rejected(client):
    response = client.post(
        "/api/rules",
        json={
            "name": "broken",
            "description": "",
            "body": {"type": "logical", "clause": {"type": "not_a_clause"}},
            "mitigations": [],
        },
    )
    assert response.status_code == 422


def test_update_replaces_mitigations(client):
    create = client.post(
        "/api/rules",
        json={
            "name": "x",
            "description": "y",
            "body": {"type": "boolean", "field": "roof_type", "must_equal": "class_a"},
            "mitigations": [{"tier": "full", "name": "A", "description": "..."}],
        },
    )
    rid = create.json()["id"]
    response = client.patch(
        f"/api/rules/{rid}",
        json={
            "mitigations": [
                {"tier": "full", "name": "B", "description": "..."},
                {"tier": "bridge", "name": "C", "description": "..."},
            ]
        },
    )
    assert response.status_code == 200
    names = [m["name"] for m in response.json()["mitigations"]]
    assert names == ["B", "C"]


def test_add_mitigation_to_existing_rule(client):
    # one of the seeded rules
    rule_id = next(r["id"] for r in client.get("/api/rules").json() if r["name"] == "Roof class")
    before = len(client.get(f"/api/rules/{rule_id}").json()["mitigations"])
    response = client.post(
        f"/api/rules/{rule_id}/mitigations",
        json={
            "tier": "bridge",
            "name": "Apply roof retardant",
            "description": "Interim coating until full replacement.",
            "effect": "buys time",
            "sort_order": 50,
        },
    )
    assert response.status_code == 201, response.text
    after = client.get(f"/api/rules/{rule_id}").json()["mitigations"]
    assert len(after) == before + 1


def test_update_single_mitigation(client):
    rule_id = next(r["id"] for r in client.get("/api/rules").json() if r["name"] == "Windows safe distance")
    rule = client.get(f"/api/rules/{rule_id}").json()
    mid = rule["mitigations"][0]["id"]
    response = client.patch(
        f"/api/rules/{rule_id}/mitigations/{mid}",
        json={"tier": "full", "name": "Renamed", "description": "Updated", "sort_order": 1},
    )
    assert response.status_code == 200
    assert response.json()["name"] == "Renamed"
    # other mitigations untouched
    rule_after = client.get(f"/api/rules/{rule_id}").json()
    assert len(rule_after["mitigations"]) == len(rule["mitigations"])


def test_delete_single_mitigation(client):
    rule_id = next(r["id"] for r in client.get("/api/rules").json() if r["name"] == "Windows safe distance")
    rule = client.get(f"/api/rules/{rule_id}").json()
    mid = rule["mitigations"][-1]["id"]
    response = client.delete(f"/api/rules/{rule_id}/mitigations/{mid}")
    assert response.status_code == 204
    after = client.get(f"/api/rules/{rule_id}").json()["mitigations"]
    assert len(after) == len(rule["mitigations"]) - 1


def test_mitigation_cross_rule_rejected(client):
    rules = client.get("/api/rules").json()
    rule_a = next(r for r in rules if r["name"] == "Roof class")
    rule_b = next(r for r in rules if r["name"] == "Windows safe distance")
    mid_b = rule_b["mitigations"][0]["id"]
    # try to update rule_b's mitigation via rule_a's URL
    response = client.patch(
        f"/api/rules/{rule_a['id']}/mitigations/{mid_b}",
        json={"tier": "full", "name": "x", "description": "y"},
    )
    assert response.status_code == 404


def test_test_endpoint_holds_for_compliant_observation(client):
    rule_id = next(r["id"] for r in client.get("/api/rules").json() if r["name"] == "Roof class")
    response = client.post(
        f"/api/rules/{rule_id}/test",
        json={"values": {"roof_type": "class_a", "wildfire_risk_category": "d"}},
    )
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["holds"] is True
    assert body["detail"] is None
    assert body["full_mitigations"] == []
    assert body["bridge_mitigations"] == []


def test_test_endpoint_violates_returns_mitigations(client):
    rule_id = next(r["id"] for r in client.get("/api/rules").json() if r["name"] == "Windows safe distance")
    response = client.post(
        f"/api/rules/{rule_id}/test",
        json={
            "values": {
                "window_type": "single",  # × 3 = 90ft threshold
                "vegetation": [{"type": "tree", "distance_to_window_ft": 50}],
            }
        },
    )
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["holds"] is False
    # New readable detail format: "Vegetation #1 (...): distance_to_window_ft is 50 ft — required: at least 90 ft."
    assert "required" in body["detail"]
    assert "at least" in body["detail"]
    assert len(body["full_mitigations"]) == 2
    assert len(body["bridge_mitigations"]) == 3


def test_test_endpoint_unknown_rule_404(client):
    response = client.post("/api/rules/9999/test", json={"values": {}})
    assert response.status_code == 404


def test_test_endpoint_with_empty_values_treats_missing_as_violation(client):
    rule_id = next(r["id"] for r in client.get("/api/rules").json() if r["name"] == "Attic Vent ember-rated")
    response = client.post(f"/api/rules/{rule_id}/test", json={"values": {}})
    body = response.json()
    assert body["holds"] is False
    assert "Missing" in body["detail"]


def test_delete_rule(client):
    create = client.post(
        "/api/rules",
        json={
            "name": "tmp",
            "description": "",
            "body": {"type": "boolean", "field": "roof_type", "must_equal": "class_a"},
            "mitigations": [],
        },
    )
    rid = create.json()["id"]
    deletion = client.delete(f"/api/rules/{rid}")
    assert deletion.status_code == 204
    after = client.get(f"/api/rules/{rid}")
    assert after.status_code == 404
