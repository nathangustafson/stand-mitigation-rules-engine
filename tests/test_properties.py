def test_create_list_get_update_delete(client):
    payload = {
        "street": "123 Oak St",
        "unit": "B",
        "city": "Boulder",
        "state": "CO",
        "zip": "80301",
        "nickname": "Mountain rental",
    }
    create = client.post("/api/properties", json=payload)
    assert create.status_code == 201, create.text
    created = create.json()
    pid = created["id"]
    assert created["street"] == payload["street"]

    listing = client.get("/api/properties")
    assert listing.status_code == 200
    items = listing.json()
    assert len(items) == 1
    assert items[0]["id"] == pid

    detail = client.get(f"/api/properties/{pid}")
    assert detail.status_code == 200
    assert detail.json()["zip"] == "80301"

    patch = client.patch(f"/api/properties/{pid}", json={"nickname": "Renamed"})
    assert patch.status_code == 200
    assert patch.json()["nickname"] == "Renamed"

    deletion = client.delete(f"/api/properties/{pid}")
    assert deletion.status_code == 204

    after = client.get(f"/api/properties/{pid}")
    assert after.status_code == 404


def test_get_unknown_property_returns_404(client):
    response = client.get("/api/properties/9999")
    assert response.status_code == 404


def test_invalid_state_rejected(client):
    response = client.post(
        "/api/properties",
        json={
            "street": "1 Main",
            "city": "Denver",
            "state": "Colorado",
            "zip": "80201",
        },
    )
    assert response.status_code == 422


def test_list_includes_outstanding_eval_summary(client):
    create = client.post(
        "/api/properties",
        json={"street": "1 Pine", "city": "Truckee", "state": "CA", "zip": "96161"},
    )
    pid = create.json()["id"]

    # No observations yet — counts are zero, latest_observation_at is null.
    listing = client.get("/api/properties").json()
    item = next(p for p in listing if p["id"] == pid)
    assert item["observation_count"] == 0
    assert item["latest_observation_at"] is None
    assert item["outstanding_vulnerability_count"] == 0
    assert item["outstanding_full_mitigation_count"] == 0
    assert item["outstanding_bridge_mitigation_count"] == 0

    # Worst-case observation → all four seeded rules fire.
    client.post(
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
    listing = client.get("/api/properties").json()
    item = next(p for p in listing if p["id"] == pid)
    assert item["observation_count"] == 1
    assert item["latest_observation_at"] is not None
    assert item["outstanding_vulnerability_count"] == 4
    # Full = 1 attic + 1 roof + 2 windows; home-to-home contributes none.
    assert item["outstanding_full_mitigation_count"] == 4
    assert item["outstanding_bridge_mitigation_count"] == 3
