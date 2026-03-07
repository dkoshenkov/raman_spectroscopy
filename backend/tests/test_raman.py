from __future__ import annotations

from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def test_parse_upload_prefers_wave_range_over_filename_band_hint() -> None:
    payload = b"""#X #Y #Wave #Intensity
0 0 2800 10
0 0 2900 12
1 1 2800 8
1 1 2900 9
"""

    response = client.post(
        "/raman/uploads/parse",
        files={"file": ("cortex_center1500_map01.txt", payload, "text/plain")},
    )

    assert response.status_code == 200
    data = response.json()
    assert data["metadata"]["band"] == "2900"
    assert data["metadata"]["brainRegion"] == "cortex"
    assert any(item["code"] == "BAND_CONFLICT" for item in data["metadata"]["diagnostics"])
    assert data["ramanMap"]["spatialMapAvailable"] is True
    assert data["ramanMap"]["dataMode"] == "map"
    assert data["ramanMap"]["spectrumCount"] == 2


def test_parse_upload_supports_non_spatial_spectrum() -> None:
    payload = b"""#Wave #Intensity
950 10
1000 11
1050 12
"""

    response = client.post(
        "/raman/uploads/parse",
        files={"file": ("endo_unknown.txt", payload, "text/plain")},
    )

    assert response.status_code == 200
    data = response.json()
    assert data["metadata"]["parseStatus"] == "partial"
    assert data["ramanMap"]["spatialMapAvailable"] is False
    assert data["ramanMap"]["dataMode"] == "single_spectrum"
    assert data["ramanMap"]["spectrumCount"] == 1
    assert any(item["code"] == "SPATIAL_MAP_UNAVAILABLE" for item in data["metadata"]["diagnostics"])


def test_parse_upload_marks_single_coordinate_map_as_single_spectrum() -> None:
    payload = b"""#X #Y #Wave #Intensity
0 0 1000 10
0 0 1001 11
0 0 1002 12
"""

    response = client.post(
        "/raman/uploads/parse",
        files={"file": ("single_point_map.txt", payload, "text/plain")},
    )

    assert response.status_code == 200
    data = response.json()
    assert data["ramanMap"]["spatialMapAvailable"] is True
    assert data["ramanMap"]["dataMode"] == "single_spectrum"
    assert data["ramanMap"]["spectrumCount"] == 1


def test_confirm_upload_applies_user_overrides() -> None:
    payload = b"""#X #Y #Wave #Intensity
0 0 1000 10
0 0 1001 11
"""
    parse_response = client.post(
        "/raman/uploads/parse",
        files={"file": ("sample.txt", payload, "text/plain")},
    )
    upload_id = parse_response.json()["uploadId"]

    confirm_response = client.post(
        f"/raman/uploads/{upload_id}/confirm",
        json={
            "band": "1500",
            "brainRegion": "striatum",
            "classLabel": "control",
            "animalId": "rat-7",
            "side": "left",
            "place": "p1",
            "repetition": "r2",
            "mapId": "m3",
        },
    )

    assert confirm_response.status_code == 200
    data = confirm_response.json()
    assert data["metadata"]["userConfirmed"] is True
    assert data["metadata"]["brainRegion"] == "striatum"
    assert data["metadata"]["userOverrides"]["animalId"] == "rat-7"
