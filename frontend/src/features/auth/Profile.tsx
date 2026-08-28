import React, { useEffect, useState, type ChangeEvent, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { Edit2, X } from "lucide-react";
import API from "../../api/axios";
import { ROUTES } from "../../config/constants";
import TopBar from "../../components/layout/TopBar";

interface UserProfile {
  phone_number: string | null;
  department: string | null;
  state: string | null;
  district: string | null;
  taluka: string | null;
  local_address: string | null;
}

interface User {
  id: number;
  username: string;
  email: string;
  role: string;
  profile: UserProfile | null;
}

interface ProfileForm {
  username: string;
  phone_number: string;
  department: string;
  state: string;
  district: string;
  taluka: string;
  local_address: string;
}

function Profile() {
  const navigate = useNavigate();

  const [user, setUser] = useState<User | null>(null);
  const [form, setForm] = useState<ProfileForm>({
    username: "",
    phone_number: "",
    department: "",
    state: "",
    district: "",
    taluka: "",
    local_address: "",
  });
  
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [isEditing, setIsEditing] = useState(false);

  useEffect(() => {
    const fetchProfile = async () => {
      try {
        const res = await API.get<User>("/auth/me");
        const userData = res.data;
        setUser(userData);
        setForm({
          username: userData.username || "",
          phone_number: userData.profile?.phone_number || "",
          department: userData.profile?.department || "",
          state: userData.profile?.state || "",
          district: userData.profile?.district || "",
          taluka: userData.profile?.taluka || "",
          local_address: userData.profile?.local_address || "",
        });
      } catch (err) {
        navigate(ROUTES.LOGIN, { replace: true });
      } finally {
        setLoading(false);
      }
    };

    fetchProfile();
  }, [navigate]);

  const handleChange = (e: ChangeEvent<HTMLInputElement>) => {
    setError(null);
    setSuccess(null);
    setForm({ ...form, [e.target.name]: e.target.value });
  };

  const handleLogout = async () => {
    try {
      await API.post("/auth/logout");
      navigate(ROUTES.LOGIN, { replace: true });
    } catch {
      // Navigate anyway on logout failure
      navigate(ROUTES.LOGIN, { replace: true });
    }
  };

  const handleCancel = () => {
    // Revert form state back to current user data
    if (user) {
      setForm({
        username: user.username || "",
        phone_number: user.profile?.phone_number || "",
        department: user.profile?.department || "",
        state: user.profile?.state || "",
        district: user.profile?.district || "",
        taluka: user.profile?.taluka || "",
        local_address: user.profile?.local_address || "",
      });
    }
    setError(null);
    setSuccess(null);
    setIsEditing(false);
  };

  const submitUpdate = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setSuccess(null);

    // Build payload mapping empty strings to null for optional fields
    const payload = {
      username: form.username,
      phone_number: form.phone_number || null,
      department: form.department || null,
      state: form.state || null,
      district: form.district || null,
      taluka: form.taluka || null,
      local_address: form.local_address || null,
    };

    try {
      const res = await API.put<User>("/auth/me", payload);
      setUser(res.data);
      setSuccess("Profile updated successfully!");
      setIsEditing(false); // Switch back to view mode on success
    } catch (err: any) {
      const detail = err?.response?.data?.detail;
      setError(
        typeof detail === "string" 
          ? detail 
          : "An error occurred while updating the profile."
      );
    } finally {
      setSaving(false);
    }
  };

  if (loading || !user) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <span className="text-gray-500">Loading...</span>
      </div>
    );
  }

  // Helper component to render fields consistently between view/edit modes
  const renderField = (
    label: string, 
    name: keyof ProfileForm | "email", 
    value: string, 
    placeholder: string,
    readOnly: boolean = false
  ) => {
    return (
      <div>
        <label className="block text-sm font-semibold text-slate-600 mb-1.5 uppercase tracking-wide text-[11px]">
          {label} {readOnly && "(Read-only)"}
        </label>
        {isEditing ? (
          name === "email" ? (
            <input
              type="email"
              value={value}
              disabled
              className="w-full rounded-xl border border-slate-200 bg-slate-100 px-4 py-2.5 text-sm
                         text-slate-500 cursor-not-allowed"
            />
          ) : (
            <input
              type="text"
              name={name}
              value={form[name as keyof ProfileForm]}
              onChange={handleChange}
              disabled={saving}
              placeholder={placeholder}
              className="w-full rounded-xl border border-slate-300 px-4 py-2.5 text-sm text-slate-800
                         focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent 
                         transition disabled:opacity-60 bg-white"
            />
          )
        ) : (
          <div className="text-sm text-slate-800 font-medium py-1">
            {value ? value : <span className="text-slate-400 italic">Not specified</span>}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 font-sans flex flex-col">
      <TopBar
        appName="G-TRISP Dashboard"
        user={user as any}
        onLogout={handleLogout}
        showNotificationBell={false}
      />
      
      <main className="flex-1 w-full px-4 sm:px-6 md:px-8 lg:px-10 xl:px-12 py-8">
        
        {/* Profile Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-6 mb-8">
          <div className="flex items-center gap-5">
            <div className="h-20 w-20 rounded-full bg-gradient-to-tr from-indigo-600 to-violet-500 flex items-center justify-center text-white text-3xl font-bold shadow-lg shrink-0 border-4 border-white">
              {user.username.charAt(0).toUpperCase()}
            </div>
            <div>
              <h1 className="text-3xl font-extrabold text-slate-900 tracking-tight">My Profile</h1>
              <p className="text-slate-500 mt-1 font-medium">
                Manage your personal information and preferences.
              </p>
            </div>
          </div>

          {!isEditing && (
            <button
              onClick={() => setIsEditing(true)}
              className="flex items-center justify-center gap-2 rounded-xl bg-indigo-600 text-white px-5 py-2.5 text-sm font-semibold hover:bg-indigo-700 transition-all shadow-md hover:shadow-lg active:scale-95"
            >
              <Edit2 size={16} />
              Update Profile
            </button>
          )}
        </div>

        {error && (
          <div className="mb-8 rounded-xl bg-rose-50 border border-rose-200 px-5 py-4 text-sm text-rose-700 font-medium shadow-sm flex items-center">
            {error}
          </div>
        )}
        
        {success && (
          <div className="mb-8 rounded-xl bg-emerald-50 border border-emerald-200 px-5 py-4 text-sm text-emerald-700 font-medium shadow-sm flex items-center">
            {success}
          </div>
        )}

        <form onSubmit={submitUpdate} className="space-y-6">
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 lg:gap-8">
            
            {/* Left Column */}
            <div className="flex flex-col gap-6 lg:gap-8">
              
              {/* Core Information Card */}
              <div className="bg-white rounded-3xl shadow-sm border border-slate-200/60 p-6 sm:p-8">
                <h2 className="text-base font-bold text-slate-900 mb-6 flex items-center gap-2">
                  <span className="w-1.5 h-6 bg-indigo-500 rounded-full inline-block"></span>
                  Core Information
                </h2>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-6">
                  {renderField("Username", "username", isEditing ? form.username : user.username, "Your username")}
                  {renderField("Email Address", "email", user.email, "", true)}
                </div>
              </div>

              {/* Contact & Details Card */}
              <div className="bg-white rounded-3xl shadow-sm border border-slate-200/60 p-6 sm:p-8">
                <h2 className="text-base font-bold text-slate-900 mb-6 flex items-center gap-2">
                  <span className="w-1.5 h-6 bg-indigo-500 rounded-full inline-block"></span>
                  Contact & Details
                </h2>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-6">
                  {renderField("Phone Number", "phone_number", isEditing ? form.phone_number : (user.profile?.phone_number || ""), "+91 ")}
                  {renderField("Department", "department", isEditing ? form.department : (user.profile?.department || ""), "e.g. Traffic Police")}
                </div>
              </div>

            </div>

            {/* Right Column */}
            <div className="flex flex-col gap-6 lg:gap-8">
              
              {/* Address Card */}
              <div className="bg-white rounded-3xl shadow-sm border border-slate-200/60 p-6 sm:p-8">
                <h2 className="text-base font-bold text-slate-900 mb-6 flex items-center gap-2">
                  <span className="w-1.5 h-6 bg-indigo-500 rounded-full inline-block"></span>
                  Address
                </h2>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-6 mb-6">
                  {renderField("State", "state", isEditing ? form.state : (user.profile?.state || ""), "e.g. Gujarat")}
                  {renderField("District", "district", isEditing ? form.district : (user.profile?.district || ""), "e.g. Surat")}
                  {renderField("Taluka", "taluka", isEditing ? form.taluka : (user.profile?.taluka || ""), "e.g. Choryasi")}
                </div>
                
                <div className="mt-2">
                  {renderField("Local Address / Street", "local_address", isEditing ? form.local_address : (user.profile?.local_address || ""), "e.g. 123 Main St, Near Police Station")}
                </div>
              </div>

            </div>
          </div>

          {/* Action Buttons (Only visible when editing) */}
          {isEditing && (
            <div className="mt-8 flex items-center justify-end gap-4 p-4 bg-white/50 border border-slate-200/60 rounded-2xl backdrop-blur-sm">
              <button
                type="button"
                onClick={handleCancel}
                disabled={saving}
                className="flex items-center gap-2 rounded-xl bg-white border border-slate-300 px-6 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-50 transition-colors disabled:opacity-50"
              >
                <X size={16} />
                Cancel
              </button>
              <button
                type="submit"
                disabled={saving}
                className="rounded-xl bg-indigo-600 px-8 py-3 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed shadow-md hover:shadow-lg transition-all active:scale-[0.98]"
              >
                {saving ? "Saving Changes…" : "Save Changes"}
              </button>
            </div>
          )}

        </form>
      </main>
    </div>
  );
}

export default Profile;
