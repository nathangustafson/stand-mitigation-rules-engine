def test_seed_creates_demo_properties(client):
    response = client.post("/api/demo/seed")
    assert response.status_code == 200
    body = response.json()
    assert body["properties_created"] == 4
    assert body["observations_created"] >= 4
    assert body["properties_skipped"] == 0

    listing = client.get("/api/properties").json()
    nicknames = {p["nickname"] for p in listing}
    assert "Demo: Mountain cabin (high risk)" in nicknames
    assert "Demo: Suburban home (compliant)" in nicknames
    assert "Demo: Mixed (one rule fires)" in nicknames
    assert "Demo: Every mitigation visible" in nicknames


def test_every_mitigation_visible_demo_surfaces_all_mitigations(client):
    """The 'Every mitigation visible' property exists so reviewers can see
    every mitigation the brief defines on a single property — useful when
    walking through the engine output during a demo."""
    client.post("/api/demo/seed")
    listing = client.get("/api/properties").json()
    target = next(p for p in listing if p["nickname"] == "Demo: Every mitigation visible")
    # All 4 rules fire; full = 1 (Attic Vent) + 1 (Roof) + 2 (Windows); bridge = 3 (Windows).
    assert target["outstanding_vulnerability_count"] == 4
    assert target["outstanding_full_mitigation_count"] == 4
    assert target["outstanding_bridge_mitigation_count"] == 3


def test_seed_is_idempotent_on_nickname(client):
    first = client.post("/api/demo/seed").json()
    second = client.post("/api/demo/seed").json()
    assert second["properties_created"] == 0
    assert second["properties_skipped"] == first["properties_created"]


def test_seeded_observations_show_remediation_journey(client):
    """The high-risk property has multiple observations spaced out over time so
    the timeline view has something interesting to show — the oldest fires all
    four rules; the newest still fires the unmitigatable home-to-home rule
    after every other issue has been remediated."""
    client.post("/api/demo/seed")
    properties = client.get("/api/properties").json()
    by_name = {p["nickname"]: p for p in properties}
    high_risk = by_name["Demo: Mountain cabin (high risk)"]

    obs = client.get(f"/api/properties/{high_risk['id']}/observations").json()
    assert len(obs) >= 2, "high-risk demo should have multiple observations for timeline"
    # API returns newest-first
    newest, oldest = obs[0], obs[-1]
    # Different timestamps, in order
    assert newest["captured_at"] > oldest["captured_at"]

    eval_oldest = client.post(f"/api/properties/{high_risk['id']}/observations/{oldest['id']}/evaluate").json()
    assert len(eval_oldest["vulnerabilities"]) == 4
    assert eval_oldest["bridge_mitigation_count"] == 3

    # Newest: vents/roof/windows/vegetation all remediated, but the home-to-home
    # distance is unmitigatable so that rule still fires.
    eval_newest = client.post(f"/api/properties/{high_risk['id']}/observations/{newest['id']}/evaluate").json()
    rule_names = {v["rule_name"] for v in eval_newest["vulnerabilities"]}
    assert rule_names == {"Home-to-home distance"}
    # Home-to-home has zero mitigations attached.
    assert eval_newest["bridge_mitigation_count"] == 0
    assert eval_newest["full_mitigations"] == []


def test_seeded_compliant_property_has_no_vulnerabilities(client):
    client.post("/api/demo/seed")
    properties = client.get("/api/properties").json()
    compliant = next(p for p in properties if p["nickname"] == "Demo: Suburban home (compliant)")
    obs = client.get(f"/api/properties/{compliant['id']}/observations").json()[0]
    result = client.post(f"/api/properties/{compliant['id']}/observations/{obs['id']}/evaluate").json()
    assert result["vulnerabilities"] == []
    assert result["bridge_mitigation_count"] == 0
