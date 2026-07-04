// frontend/src/components/admin/AccidentFormModal.tsx
/**
 * Modal form for admins to manually add or edit a Surat accident record.
 * Matches the AdminPanel's indigo/slate glass-morphism aesthetic.
 */

import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  X,
  ChevronRight,
  ChevronLeft,
  CheckCircle,
  Loader2,
  MapPin,
  Car,
  CloudSun,
  ShieldAlert,
  FileText,
  AlertCircle,
} from "lucide-react";
import { adminAccidentsApi, type AccidentRecord } from "../../api/adminAccidentsApi";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface FormData {
  accident_id: string;
  police_station: string;
  accident_date_time: string;
  severity: string;
  latitude: string;
  longitude: string;
  road_name: string;
  road_classification: string;
  number_of_vehicles: string;
  driver_killed: string;
  driver_grievous_injury: string;
  driver_minor_injury: string;
  passenger_killed: string;
  passenger_grievous_injury: string;
  passenger_minor_injury: string;
  pedestrian_killed: string;
  pedestrian_grievous_injury: string;
  pedestrian_minor_injury: string;
  type_of_collision: string;
  collision_feature: string;
  weather_condition: string;
  light_condition: string;
  visibility: string;
  traffic_violation: string;
}

const EMPTY_FORM: FormData = {
  accident_id: "",
  police_station: "",
  accident_date_time: "",
  severity: "",
  latitude: "",
  longitude: "",
  road_name: "",
  road_classification: "",
  number_of_vehicles: "1",
  driver_killed: "0",
  driver_grievous_injury: "0",
  driver_minor_injury: "0",
  passenger_killed: "0",
  passenger_grievous_injury: "0",
  passenger_minor_injury: "0",
  pedestrian_killed: "0",
  pedestrian_grievous_injury: "0",
  pedestrian_minor_injury: "0",
  type_of_collision: "",
  collision_feature: "",
  weather_condition: "",
  light_condition: "",
  visibility: "",
  traffic_violation: "",
};

// ---------------------------------------------------------------------------
// Static option lists (mirroring common iRAD values)
// ---------------------------------------------------------------------------

const SEVERITY_OPTIONS = [
  "Fatal",
  "Grievous Injury",
  "Minor Injury",
  "Damage Only",
];

const ROAD_CLASS_OPTIONS = [
  "National Highway",
  "State Highway",
  "Major District Road",
  "Other District Road",
  "Village Road",
  "Urban Road",
];

const COLLISION_OPTIONS = [
  "Right Turn",
  "Left Turn",
  "Going Straight",
  "U-Turn",
  "Overtaking",
  "Swerving",
  "Fallen Down",
  "Head On",
  "Rear Impact",
  "Side Impact",
  "Hit Object on Road",
  "Hit Parked Vehicle",
];

const COLLISION_FEATURE_OPTIONS = [
  "Vehicle to Vehicle",
  "Vehicle to Pedestrian",
  "Vehicle to Animal",
  "Vehicle to Fixed Object",
  "Vehicle to Two Wheeler",
  "Single Vehicle",
];

const WEATHER_OPTIONS = [
  "Clear",
  "Cloudy",
  "Light Rain",
  "Heavy Rain",
  "Fog",
  "Mist",
  "Dust Storm",
];

const LIGHT_OPTIONS = [
  "Daylight",
  "Dawn/Dusk",
  "Darkness with Street Light",
  "Darkness without Street Light",
  "Darkness with Street Light Not Functioning",
];

const VISIBILITY_OPTIONS = ["Good", "Moderate", "Poor"];

const VIOLATION_OPTIONS = [
  "Drunken Driving",
  "Over Speeding",
  "Jumping Red Light",
  "Use of Mobile Phone",
  "Overloading",
  "Wrong Side Driving",
  "Without Helmet",
  "Without Seatbelt",
  "No Violation",
  "Unknown",
];

// ---------------------------------------------------------------------------
// Step definitions
// ---------------------------------------------------------------------------

const STEPS = [
  { id: 1, label: "Basic Info", icon: FileText },
  { id: 2, label: "Location", icon: MapPin },
  { id: 3, label: "Casualties", icon: Car },
  { id: 4, label: "Conditions", icon: CloudSun },
];

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function Label({
  children,
  required,
}: {
  children: React.ReactNode;
  required?: boolean;
}) {
  return (
    <label className="block text-xs font-semibold text-slate-600 mb-1.5 uppercase tracking-wide">
      {children}
      {required && <span className="text-rose-500 ml-1">*</span>}
    </label>
  );
}

function Input({
  value,
  onChange,
  type = "text",
  placeholder,
  min,
  disabled = false,
}: {
  value: string;
  onChange: (v: string) => void;
  type?: string;
  placeholder?: string;
  min?: string;
  disabled?: boolean;
}) {
  return (
    <input
      type={type}
      value={value}
      min={min}
      placeholder={placeholder}
      onChange={(e) => onChange(e.target.value)}
      disabled={disabled}
      className={`w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm text-slate-800 placeholder-slate-400 outline-none ring-0 transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 ${disabled ? "opacity-60 cursor-not-allowed bg-slate-50" : ""}`}
    />
  );
}

function Select({
  value,
  onChange,
  options,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  options: string[];
  placeholder?: string;
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm text-slate-800 outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 appearance-none cursor-pointer"
    >
      {placeholder && (
        <option value="" disabled>
          {placeholder}
        </option>
      )}
      {options.map((o) => (
        <option key={o} value={o}>
          {o}
        </option>
      ))}
    </select>
  );
}

function NumberInput({
  value,
  onChange,
  label,
}: {
  value: string;
  onChange: (v: string) => void;
  label: string;
}) {
  return (
    <div>
      <Label>{label}</Label>
      <input
        type="number"
        min="0"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm text-slate-800 outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20"
      />
    </div>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h4 className="text-xs font-bold text-indigo-700 uppercase tracking-widest mb-3 mt-5 first:mt-0 border-b border-indigo-100 pb-1.5">
      {children}
    </h4>
  );
}

// ---------------------------------------------------------------------------
// Step panels
// ---------------------------------------------------------------------------

function StepBasicInfo({
  form,
  update,
  isEdit
}: {
  form: FormData;
  update: (k: keyof FormData, v: string) => void;
  isEdit: boolean;
}) {
  return (
    <div className="flex flex-col gap-4">
      <SectionTitle>Identification</SectionTitle>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <Label>Accident ID</Label>
          <Input
            value={form.accident_id}
            onChange={(v) => update("accident_id", v)}
            placeholder="Auto-generated if blank"
            disabled={isEdit}
          />
        </div>
        <div>
          <Label required>Police Station</Label>
          <Input
            value={form.police_station}
            onChange={(v) => update("police_station", v)}
            placeholder="e.g. Surat City"
          />
        </div>
      </div>
      <SectionTitle>Date & Severity</SectionTitle>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <Label required>Accident Date & Time</Label>
          <Input
            type="datetime-local"
            value={form.accident_date_time}
            onChange={(v) => update("accident_date_time", v)}
          />
        </div>
        <div>
          <Label required>Severity</Label>
          <Select
            value={form.severity}
            onChange={(v) => update("severity", v)}
            options={SEVERITY_OPTIONS}
            placeholder="Select severity"
          />
        </div>
      </div>
    </div>
  );
}

function StepLocation({
  form,
  update,
}: {
  form: FormData;
  update: (k: keyof FormData, v: string) => void;
}) {
  return (
    <div className="flex flex-col gap-4">
      <SectionTitle>GPS Coordinates</SectionTitle>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <Label>Latitude</Label>
          <Input
            type="number"
            value={form.latitude}
            onChange={(v) => update("latitude", v)}
            placeholder="e.g. 21.1702"
          />
        </div>
        <div>
          <Label>Longitude</Label>
          <Input
            type="number"
            value={form.longitude}
            onChange={(v) => update("longitude", v)}
            placeholder="e.g. 72.8311"
          />
        </div>
      </div>
      <SectionTitle>Road Details</SectionTitle>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <Label>Road Name</Label>
          <Input
            value={form.road_name}
            onChange={(v) => update("road_name", v)}
            placeholder="e.g. Ring Road"
          />
        </div>
        <div>
          <Label>Road Classification</Label>
          <Select
            value={form.road_classification}
            onChange={(v) => update("road_classification", v)}
            options={ROAD_CLASS_OPTIONS}
            placeholder="Select road type"
          />
        </div>
      </div>
      <div className="rounded-xl bg-blue-50 border border-blue-100 px-4 py-3 text-xs text-blue-700 flex items-start gap-2.5">
        <MapPin size={14} className="mt-0.5 shrink-0 text-blue-500" />
        <span>
          Coordinates should be within the Surat district boundary (approx. lat
          20.9-21.4, lon 72.6-73.2).
        </span>
      </div>
    </div>
  );
}

function StepCasualties({
  form,
  update,
}: {
  form: FormData;
  update: (k: keyof FormData, v: string) => void;
}) {
  return (
    <div className="flex flex-col gap-4">
      <SectionTitle>Vehicles</SectionTitle>
      <div className="max-w-xs">
        <NumberInput
          value={form.number_of_vehicles}
          onChange={(v) => update("number_of_vehicles", v)}
          label="Number of Vehicles"
        />
      </div>

      <SectionTitle>Driver Casualties</SectionTitle>
      <div className="grid grid-cols-3 gap-3">
        <NumberInput
          value={form.driver_killed}
          onChange={(v) => update("driver_killed", v)}
          label="Killed"
        />
        <NumberInput
          value={form.driver_grievous_injury}
          onChange={(v) => update("driver_grievous_injury", v)}
          label="Grievous"
        />
        <NumberInput
          value={form.driver_minor_injury}
          onChange={(v) => update("driver_minor_injury", v)}
          label="Minor"
        />
      </div>

      <SectionTitle>Passenger Casualties</SectionTitle>
      <div className="grid grid-cols-3 gap-3">
        <NumberInput
          value={form.passenger_killed}
          onChange={(v) => update("passenger_killed", v)}
          label="Killed"
        />
        <NumberInput
          value={form.passenger_grievous_injury}
          onChange={(v) => update("passenger_grievous_injury", v)}
          label="Grievous"
        />
        <NumberInput
          value={form.passenger_minor_injury}
          onChange={(v) => update("passenger_minor_injury", v)}
          label="Minor"
        />
      </div>

      <SectionTitle>Pedestrian Casualties</SectionTitle>
      <div className="grid grid-cols-3 gap-3">
        <NumberInput
          value={form.pedestrian_killed}
          onChange={(v) => update("pedestrian_killed", v)}
          label="Killed"
        />
        <NumberInput
          value={form.pedestrian_grievous_injury}
          onChange={(v) => update("pedestrian_grievous_injury", v)}
          label="Grievous"
        />
        <NumberInput
          value={form.pedestrian_minor_injury}
          onChange={(v) => update("pedestrian_minor_injury", v)}
          label="Minor"
        />
      </div>
    </div>
  );
}

function StepConditions({
  form,
  update,
}: {
  form: FormData;
  update: (k: keyof FormData, v: string) => void;
}) {
  return (
    <div className="flex flex-col gap-4">
      <SectionTitle>Collision</SectionTitle>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <Label>Type of Collision</Label>
          <Select
            value={form.type_of_collision}
            onChange={(v) => update("type_of_collision", v)}
            options={COLLISION_OPTIONS}
            placeholder="Select type"
          />
        </div>
        <div>
          <Label>Collision Feature</Label>
          <Select
            value={form.collision_feature}
            onChange={(v) => update("collision_feature", v)}
            options={COLLISION_FEATURE_OPTIONS}
            placeholder="Select feature"
          />
        </div>
      </div>

      <SectionTitle>Environmental Conditions</SectionTitle>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div>
          <Label>Weather</Label>
          <Select
            value={form.weather_condition}
            onChange={(v) => update("weather_condition", v)}
            options={WEATHER_OPTIONS}
            placeholder="Select weather"
          />
        </div>
        <div>
          <Label>Light Condition</Label>
          <Select
            value={form.light_condition}
            onChange={(v) => update("light_condition", v)}
            options={LIGHT_OPTIONS}
            placeholder="Select light"
          />
        </div>
        <div>
          <Label>Visibility</Label>
          <Select
            value={form.visibility}
            onChange={(v) => update("visibility", v)}
            options={VISIBILITY_OPTIONS}
            placeholder="Select visibility"
          />
        </div>
      </div>

      <SectionTitle>Violation</SectionTitle>
      <div>
        <Label>Traffic Violation</Label>
        <Select
          value={form.traffic_violation}
          onChange={(v) => update("traffic_violation", v)}
          options={VIOLATION_OPTIONS}
          placeholder="Select violation"
        />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

function validateStep(step: number, form: FormData): string | null {
  if (step === 1) {
    if (!form.police_station.trim()) return "Police station is required.";
    if (!form.accident_date_time) return "Accident date & time is required.";
    if (!form.severity) return "Severity is required.";
  }
  return null;
}

// ---------------------------------------------------------------------------
// Main modal component
// ---------------------------------------------------------------------------

interface Props {
  open: boolean;
  onClose: () => void;
  onSuccess: (accidentId: string) => void;
  initialData?: AccidentRecord | null;
}

export default function AccidentFormModal({ open, onClose, onSuccess, initialData }: Props) {
  const [step, setStep] = useState(1);
  const [form, setForm] = useState<FormData>(EMPTY_FORM);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [stepError, setStepError] = useState<string | null>(null);

  // Initialize form
  useEffect(() => {
    if (open) {
      setStep(1);
      setError(null);
      setStepError(null);
      
      if (initialData) {
        // format date time for input type="datetime-local"
        let formattedDate = "";
        if (initialData.accident_date_time) {
          const date = new Date(initialData.accident_date_time);
          if (!isNaN(date.getTime())) {
             formattedDate = new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
          }
        }
        
        setForm({
          accident_id: initialData.accident_id || "",
          police_station: initialData.police_station || "",
          accident_date_time: formattedDate,
          severity: initialData.severity || "",
          latitude: initialData.latitude ? initialData.latitude.toString() : "",
          longitude: initialData.longitude ? initialData.longitude.toString() : "",
          road_name: initialData.road_name || "",
          road_classification: initialData.road_classification || "",
          number_of_vehicles: (initialData.number_of_vehicles || 0).toString(),
          driver_killed: (initialData.driver_killed || 0).toString(),
          driver_grievous_injury: (initialData.driver_grievous_injury || 0).toString(),
          driver_minor_injury: (initialData.driver_minor_injury || 0).toString(),
          passenger_killed: (initialData.passenger_killed || 0).toString(),
          passenger_grievous_injury: (initialData.passenger_grievous_injury || 0).toString(),
          passenger_minor_injury: (initialData.passenger_minor_injury || 0).toString(),
          pedestrian_killed: (initialData.pedestrian_killed || 0).toString(),
          pedestrian_grievous_injury: (initialData.pedestrian_grievous_injury || 0).toString(),
          pedestrian_minor_injury: (initialData.pedestrian_minor_injury || 0).toString(),
          type_of_collision: initialData.type_of_collision || "",
          collision_feature: initialData.collision_feature || "",
          weather_condition: initialData.weather_condition || "",
          light_condition: initialData.light_condition || "",
          visibility: initialData.visibility || "",
          traffic_violation: initialData.traffic_violation || "",
        });
      } else {
        setForm(EMPTY_FORM);
      }
    }
  }, [open, initialData]);

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [open, onClose]);

  const update = useCallback((k: keyof FormData, v: string) => {
    setForm((f) => ({ ...f, [k]: v }));
    setStepError(null);
  }, []);

  const goNext = () => {
    const err = validateStep(step, form);
    if (err) {
      setStepError(err);
      return;
    }
    setStepError(null);
    setStep((s) => Math.min(s + 1, STEPS.length));
  };

  const goBack = () => {
    setStepError(null);
    setStep((s) => Math.max(s - 1, 1));
  };

  const handleSubmit = async () => {
    setSubmitting(true);
    setError(null);
    try {
      const payload: Partial<AccidentRecord> = {
        ...form,
        latitude: form.latitude ? parseFloat(form.latitude) : null,
        longitude: form.longitude ? parseFloat(form.longitude) : null,
        number_of_vehicles: parseInt(form.number_of_vehicles || "0"),
        driver_killed: parseInt(form.driver_killed || "0"),
        driver_grievous_injury: parseInt(form.driver_grievous_injury || "0"),
        driver_minor_injury: parseInt(form.driver_minor_injury || "0"),
        passenger_killed: parseInt(form.passenger_killed || "0"),
        passenger_grievous_injury: parseInt(
          form.passenger_grievous_injury || "0"
        ),
        passenger_minor_injury: parseInt(form.passenger_minor_injury || "0"),
        pedestrian_killed: parseInt(form.pedestrian_killed || "0"),
        pedestrian_grievous_injury: parseInt(
          form.pedestrian_grievous_injury || "0"
        ),
        pedestrian_minor_injury: parseInt(form.pedestrian_minor_injury || "0"),
        accident_id: form.accident_id.trim() || undefined,
        road_name: form.road_name.trim() || null,
        road_classification: form.road_classification || null,
        type_of_collision: form.type_of_collision || null,
        collision_feature: form.collision_feature || null,
        weather_condition: form.weather_condition || null,
        light_condition: form.light_condition || null,
        visibility: form.visibility || null,
        traffic_violation: form.traffic_violation || null,
      };

      if (initialData) {
        await adminAccidentsApi.updateAccident(initialData.id, payload);
        onSuccess(initialData.accident_id);
      } else {
        const res = await adminAccidentsApi.addAccident(payload);
        onSuccess(res.accident_id);
      }
    } catch (err: unknown) {
      const detail = (err as { response?: { data?: { detail?: string } } })
        ?.response?.data?.detail;
      setError(detail || "Failed to save accident record. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  const isLastStep = step === STEPS.length;
  const isEdit = !!initialData;

  return (
    <AnimatePresence>
      {open && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-sm"
            onClick={onClose}
          />

          {/* Modal */}
          <motion.div
            initial={{ opacity: 0, scale: 0.96, y: 16 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 16 }}
            transition={{ type: "spring", stiffness: 340, damping: 28 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none"
          >
            <div
              className="w-full max-w-2xl bg-white rounded-3xl shadow-2xl shadow-slate-900/25 border border-slate-200/60 flex flex-col overflow-hidden pointer-events-auto"
              style={{ maxHeight: "90vh" }}
              onClick={(e) => e.stopPropagation()}
            >
              {/* Header */}
              <div className="relative flex items-center gap-3 px-6 pt-6 pb-4 bg-gradient-to-r from-indigo-900 via-blue-900 to-slate-900 shrink-0">
                <div className="p-2 bg-white/10 rounded-xl">
                  <ShieldAlert size={20} className="text-indigo-200" />
                </div>
                <div>
                  <h2 className="text-lg font-bold text-white">
                    {isEdit ? "Edit Accident Record" : "Add Accident Record"}
                  </h2>
                  <p className="text-xs text-indigo-300 mt-0.5">
                    {isEdit ? `Modifying record ${initialData.accident_id}` : "Manually enter a Surat accident into the database"}
                  </p>
                </div>
                <button
                  onClick={onClose}
                  className="absolute right-4 top-4 p-2 rounded-xl text-white/60 hover:text-white hover:bg-white/10 transition"
                >
                  <X size={18} />
                </button>
              </div>

              {/* Step indicator */}
              <div className="flex items-center gap-0 px-6 py-4 bg-slate-50 border-b border-slate-200 shrink-0">
                {STEPS.map((s, idx) => {
                  const Icon = s.icon;
                  const active = s.id === step;
                  const done = s.id < step;
                  return (
                    <div
                      key={s.id}
                      className="flex items-center flex-1 min-w-0"
                    >
                      <div className="flex flex-col items-center gap-1 min-w-0">
                        <div
                          className={`flex items-center justify-center w-8 h-8 rounded-full border-2 text-xs font-bold transition-all ${
                            done
                              ? "bg-emerald-500 border-emerald-500 text-white"
                              : active
                                ? "bg-indigo-700 border-indigo-700 text-white"
                                : "bg-white border-slate-300 text-slate-400"
                          }`}
                        >
                          {done ? (
                            <CheckCircle size={14} />
                          ) : (
                            <Icon size={14} />
                          )}
                        </div>
                        <span
                          className={`text-[10px] font-semibold truncate ${
                            active
                              ? "text-indigo-700"
                              : done
                                ? "text-emerald-600"
                                : "text-slate-400"
                          }`}
                        >
                          {s.label}
                        </span>
                      </div>
                      {idx < STEPS.length - 1 && (
                        <div
                          className={`flex-1 h-0.5 mx-2 rounded transition-all ${
                            done ? "bg-emerald-400" : "bg-slate-200"
                          }`}
                        />
                      )}
                    </div>
                  );
                })}
              </div>

              {/* Form body */}
              <div className="flex-1 overflow-y-auto px-6 py-5">
                <AnimatePresence mode="wait">
                  <motion.div
                    key={step}
                    initial={{ opacity: 0, x: 18 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -18 }}
                    transition={{ duration: 0.18 }}
                  >
                    {step === 1 && (
                      <StepBasicInfo form={form} update={update} isEdit={isEdit} />
                    )}
                    {step === 2 && <StepLocation form={form} update={update} />}
                    {step === 3 && (
                      <StepCasualties form={form} update={update} />
                    )}
                    {step === 4 && (
                      <StepConditions form={form} update={update} />
                    )}
                  </motion.div>
                </AnimatePresence>

                {/* Step error */}
                <AnimatePresence>
                  {stepError && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: "auto" }}
                      exit={{ opacity: 0, height: 0 }}
                      className="mt-4 flex items-center gap-2.5 rounded-xl bg-rose-50 border border-rose-200 px-4 py-3 text-sm text-rose-700"
                    >
                      <AlertCircle size={16} className="shrink-0" />
                      <span>{stepError}</span>
                    </motion.div>
                  )}
                </AnimatePresence>

                {/* Submit error */}
                <AnimatePresence>
                  {error && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: "auto" }}
                      exit={{ opacity: 0, height: 0 }}
                      className="mt-4 flex items-center gap-2.5 rounded-xl bg-rose-50 border border-rose-200 px-4 py-3 text-sm text-rose-700"
                    >
                      <AlertCircle size={16} className="shrink-0" />
                      <span>{error}</span>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              {/* Footer */}
              <div className="flex items-center justify-between px-6 py-4 bg-slate-50 border-t border-slate-200 shrink-0">
                <button
                  onClick={goBack}
                  disabled={step === 1 || submitting}
                  className="flex items-center gap-1.5 px-4 py-2 text-sm font-semibold text-slate-600 hover:text-slate-900 disabled:opacity-40 transition-colors"
                >
                  <ChevronLeft size={16} />
                  Back
                </button>
                {isLastStep ? (
                  <button
                    onClick={handleSubmit}
                    disabled={submitting}
                    className="flex items-center gap-2 px-6 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-sm font-bold shadow-md shadow-indigo-700/25 disabled:opacity-70 transition-all active:scale-95"
                  >
                    {submitting ? (
                      <>
                        <Loader2 size={16} className="animate-spin" />
                        Saving...
                      </>
                    ) : (
                      <>
                        <CheckCircle size={16} />
                        {isEdit ? "Update Record" : "Submit Record"}
                      </>
                    )}
                  </button>
                ) : (
                  <button
                    onClick={goNext}
                    className="flex items-center gap-1.5 px-6 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-sm font-bold shadow-md shadow-slate-900/20 transition-all active:scale-95"
                  >
                    Next
                    <ChevronRight size={16} />
                  </button>
                )}
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
