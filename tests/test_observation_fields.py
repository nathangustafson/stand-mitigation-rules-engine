def test_seeded_fields_returned(client):
    response = client.get("/api/observation-fields")
    assert response.status_code == 200
    fields = response.json()
    keys = [f["key"] for f in fields]
    assert keys == [
        "attic_vent_screen",
        "roof_type",
        "window_type",
        "wildfire_risk_category",
        "home_to_home_distance_ft",
        "vegetation",
    ]


def test_vegetation_field_carries_item_schema(client):
    fields = client.get("/api/observation-fields").json()
    veg = next(f for f in fields if f["key"] == "vegetation")
    assert veg["type"] == "list_of_object"
    sub_keys = [f["key"] for f in veg["item_schema"]["fields"]]
    assert sub_keys == ["type", "distance_to_window_ft"]


def test_enum_field_carries_allowed_values(client):
    fields = client.get("/api/observation-fields").json()
    roof = next(f for f in fields if f["key"] == "roof_type")
    assert roof["type"] == "enum"
    assert roof["allowed_values"] == ["class_a", "class_b", "class_c"]


def test_create_field(client):
    response = client.post(
        "/api/observation-fields",
        json={
            "key": "defensible_space_ft",
            "label": "Defensible space",
            "type": "number",
            "unit": "ft",
            "group_label": "Site",
            "sort_order": 60,
        },
    )
    assert response.status_code == 201, response.text
    body = response.json()
    assert body["key"] == "defensible_space_ft"

    listing = client.get("/api/observation-fields").json()
    keys = [f["key"] for f in listing]
    assert "defensible_space_ft" in keys


def test_create_field_duplicate_key_conflicts(client):
    response = client.post(
        "/api/observation-fields",
        json={"key": "roof_type", "label": "x", "type": "string"},
    )
    assert response.status_code == 409


def test_update_field_label(client):
    fields = client.get("/api/observation-fields").json()
    fid = next(f["id"] for f in fields if f["key"] == "roof_type")
    response = client.patch(
        f"/api/observation-fields/{fid}",
        json={"label": "Roof material class"},
    )
    assert response.status_code == 200
    assert response.json()["label"] == "Roof material class"


def test_deprecate_then_undeprecate_field(client):
    fields = client.get("/api/observation-fields").json()
    fid = next(f["id"] for f in fields if f["key"] == "vegetation")
    deprecate = client.patch(f"/api/observation-fields/{fid}", json={"deprecated": True})
    assert deprecate.json()["deprecated_at"] is not None
    undo = client.patch(f"/api/observation-fields/{fid}", json={"deprecated": False})
    assert undo.json()["deprecated_at"] is None


def test_delete_field(client):
    response = client.post(
        "/api/observation-fields",
        json={"key": "tmp_field", "label": "Tmp", "type": "string"},
    )
    fid = response.json()["id"]
    deletion = client.delete(f"/api/observation-fields/{fid}")
    assert deletion.status_code == 204
