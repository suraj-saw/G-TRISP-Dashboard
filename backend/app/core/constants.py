# backend/app/core/constants.py

SEVERITY_FATAL = "Fatal"
SEVERITY_DAMAGE_ONLY = "Damage Only"

# Maps display category → iRAD field names on the Accident model
CASUALTY_TYPES = {
    "Drivers": {
        "killed":  "driver_killed",
        "grievous": "driver_grievous_injury",
        "minor":   "driver_minor_injury",
    },
    "Passengers": {
        "killed":  "passenger_killed",
        "grievous": "passenger_grievous_injury",
        "minor":   "passenger_minor_injury",
    },
    "Pedestrians": {
        "killed":  "pedestrian_killed",
        "grievous": "pedestrian_grievous_injury",
        "minor":   "pedestrian_minor_injury",
    },
}