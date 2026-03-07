from __future__ import annotations

from fastapi.testclient import TestClient

from app.main import app
from app.services.raman import ml as raman_ml

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


def test_predict_spectrum_returns_ml_payload(monkeypatch) -> None:
    payload = b"""#Wave #Intensity
950 10
1000 11
1050 12
"""
    parse_response = client.post(
        "/raman/uploads/parse",
        files={"file": ("cortex_center1500_sample.txt", payload, "text/plain")},
    )
    upload_id = parse_response.json()["uploadId"]
    client.post(
        f"/raman/uploads/{upload_id}/confirm",
        json={
            "band": "1500",
            "brainRegion": "cortex",
            "classLabel": "control",
            "animalId": None,
            "side": "unknown",
            "place": None,
            "repetition": None,
            "mapId": None,
        },
    )

    monkeypatch.setattr(
        raman_ml,
        "classify_raman_point",
        lambda upload, point: {
            "pred_class_id": 0,
            "pred_class_name": "control",
            "class_probs": {"control": 0.8, "exo": 0.1, "endo": 0.1},
            "visualization": {
                "spectrum": {"x": [950.0, 1000.0, 1050.0], "y": [0.1, 0.5, 0.2], "label": "processed_spectrum"},
                "attribution": {"x": [950.0, 1000.0, 1050.0], "y": [0.01, 0.2, -0.02], "label": "ig_control"},
                "peaks": [{"peak_idx": 1, "peak_nu": 1000.0, "intensity": 0.5, "prominence": 0.4}],
                "important_regions": [
                    {
                        "start_idx": 0,
                        "end_idx": 2,
                        "start_nu": 950.0,
                        "end_nu": 1050.0,
                        "peak_idx": 1,
                        "peak_nu": 1000.0,
                        "score_sum": 0.23,
                        "score_max": 0.2,
                    }
                ],
            },
        },
    )

    response = client.get(f"/raman/uploads/{upload_id}/predict", params={"point_key": "single-spectrum"})

    assert response.status_code == 200
    data = response.json()
    assert data["predictedClass"] == "control"
    assert data["probabilities"][0]["label"] == "control"
    assert data["importantRegions"][0]["peakNu"] == 1000.0
    assert data["attribution"]["label"] == "ig_control"
