import { useNavigate } from "react-router-dom";
import {
  ArrowLeft,
  Building2,
  Cloud,
  Code2,
  Database,
  ExternalLink,
  Globe2,
  Info,
  Mail,
  Map,
  MapPinned,
  Server,
  ShieldCheck,
  Users,
  Briefcase,
  Layers,
} from "lucide-react";
import { ABOUT_CONFIG } from "../../config/aboutConfig";
import { ROUTES } from "../../config/constants";
import React from "react";

const technologyIcons = {
  layout: Code2,
  server: Server,
  database: Database,
  map: Map,
  cloud: Cloud,
};

// Clean, un-nested admin card wrapper
function AdminCard({
  title,
  icon: Icon,
  children,
}: {
  title: string;
  icon?: React.ElementType;
  children: React.ReactNode;
}) {
  return (
    <div className="bg-white border border-slate-200 rounded-xl shadow-sm flex flex-col">
      <div className="px-6 py-4 border-b border-slate-100 flex items-center gap-3">
        {Icon && <Icon size={20} className="text-indigo-600" />}
        <h2 className="text-base font-bold text-slate-800">{title}</h2>
      </div>
      <div className="p-6 flex-1">{children}</div>
    </div>
  );
}

export default function AboutPage() {
  const navigate = useNavigate();
  const { project } = ABOUT_CONFIG;

  return (
    <main className="min-h-screen bg-slate-50 text-slate-900 pb-16 font-sans">
      {/* Top Navigation Bar perfectly aligned with content */}
      <header className="sticky top-0 z-30 border-b border-slate-200 bg-white shadow-sm">
        <div className="mx-auto flex h-16 max-w-[1536px] items-center justify-between px-6 lg:px-8">
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded bg-indigo-50 text-indigo-600">
              <Info size={18} />
            </div>
            <span className="text-base font-bold tracking-wide text-slate-900">
              About {project.name}
            </span>
          </div>
          <button
            onClick={() => navigate(ROUTES.DASHBOARD)}
            className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 hover:text-indigo-600"
          >
            <ArrowLeft size={16} /> Back to Dashboard
          </button>
        </div>
      </header>

      <div className="mx-auto max-w-[1536px] px-6 lg:px-8 pt-8 space-y-6">
        {/* Top Banner (Admin Style Hero) */}
        <section className="overflow-hidden rounded-xl bg-gradient-to-r from-indigo-900 to-indigo-700 text-white shadow-sm">
          <div className="p-8 sm:p-10 md:flex md:items-center md:justify-between gap-10">
            <div className="max-w-4xl">
              <div className="mb-4 inline-flex items-center gap-1.5 rounded-full bg-indigo-950/40 px-3 py-1 text-xs font-semibold uppercase tracking-wider text-indigo-100 border border-indigo-400/20">
                <ShieldCheck size={14} /> Road safety intelligence
              </div>
              <h1 className="text-3xl font-extrabold tracking-tight sm:text-4xl">
                {project.name}
              </h1>
              <p className="mt-2 text-lg font-medium text-indigo-200">
                {project.fullName}
              </p>
              <p className="mt-4 text-sm leading-relaxed text-indigo-100/90 sm:text-base">
                {project.description}
              </p>
            </div>
            {project.mark && (
              <div className="mt-8 md:mt-0 flex h-28 w-28 shrink-0 items-center justify-center rounded-xl bg-white/10 text-5xl font-black text-white backdrop-blur-sm border border-white/20 shadow-inner">
                {project.mark}
              </div>
            )}
          </div>
        </section>

        {/* Project Overview */}
        {project.metadata.length > 0 && (
          <AdminCard title="Project Overview" icon={Info}>
            <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-6">
              {project.metadata.map((item) => (
                <div key={item.label} className="flex flex-col">
                  <span className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-1">
                    {item.label}
                  </span>
                  <span className="text-sm font-semibold text-slate-900">
                    {item.value}
                  </span>
                </div>
              ))}
            </div>
          </AdminCard>
        )}

        {/* 2-Column Grid for Orgs & Contact */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {ABOUT_CONFIG.organizations.length > 0 && (
            <AdminCard title="Institutional Support" icon={Building2}>
              <div className="space-y-6">
                {ABOUT_CONFIG.organizations.map((org) => (
                  <div key={org.name}>
                    {org.type && (
                      <span className="text-[11px] font-bold uppercase tracking-wide text-indigo-600 mb-1 block">
                        {org.type}
                      </span>
                    )}
                    <h3 className="text-base font-bold text-slate-900">
                      {org.name}
                    </h3>
                    {org.department && (
                      <p className="text-sm font-medium text-slate-700 mt-0.5">
                        {org.department}
                      </p>
                    )}
                    {org.description && (
                      <p className="text-sm text-slate-500 mt-2 leading-relaxed">
                        {org.description}
                      </p>
                    )}
                    {org.website && (
                      <a
                        href={org.website}
                        target="_blank"
                        rel="noreferrer"
                        className="mt-3 inline-flex items-center gap-1.5 text-sm font-semibold text-indigo-600 hover:text-indigo-800"
                      >
                        Visit website <ExternalLink size={14} />
                      </a>
                    )}
                  </div>
                ))}
              </div>
            </AdminCard>
          )}

          <AdminCard title="Contact Information" icon={Mail}>
            <div className="space-y-5">
              {ABOUT_CONFIG.contact.institution && (
                <div className="flex gap-4">
                  <Building2 size={20} className="text-slate-400 shrink-0" />
                  <div>
                    <p className="text-xs font-bold uppercase tracking-wider text-slate-500">
                      Institution
                    </p>
                    <p className="text-sm font-medium text-slate-900 mt-0.5">
                      {ABOUT_CONFIG.contact.institution}
                    </p>
                  </div>
                </div>
              )}
              {ABOUT_CONFIG.contact.address && (
                <div className="flex gap-4">
                  <MapPinned size={20} className="text-slate-400 shrink-0" />
                  <div>
                    <p className="text-xs font-bold uppercase tracking-wider text-slate-500">
                      Office address
                    </p>
                    <p className="text-sm text-slate-700 mt-0.5">
                      {ABOUT_CONFIG.contact.address}
                    </p>
                  </div>
                </div>
              )}
              {ABOUT_CONFIG.contact.website && (
                <div className="flex gap-4">
                  <Globe2 size={20} className="text-slate-400 shrink-0" />
                  <div>
                    <p className="text-xs font-bold uppercase tracking-wider text-slate-500">
                      Website
                    </p>
                    <a
                      href={ABOUT_CONFIG.contact.website}
                      target="_blank"
                      rel="noreferrer"
                      className="text-sm font-medium text-indigo-600 hover:underline mt-0.5 block"
                    >
                      {ABOUT_CONFIG.contact.website}
                    </a>
                  </div>
                </div>
              )}
            </div>
          </AdminCard>
        </div>

        {/* Team Sections - Flat layout inside cards */}
        {ABOUT_CONFIG.teamGroups.map(
          (group) =>
            group.members.length > 0 && (
              <AdminCard
                key={group.title}
                title={group.title}
                icon={group.title.includes("Supervision") ? Briefcase : Users}
              >
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-8">
                  {group.members.map((member) => (
                    <div
                      key={`${group.title}-${member.name}`}
                      className="flex items-start gap-4"
                    >
                      <div className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-full bg-slate-100 text-lg font-bold text-slate-600 ring-1 ring-slate-200">
                        {member.photo ? (
                          <img
                            src={member.photo}
                            alt={member.name}
                            className="h-full w-full object-cover"
                          />
                        ) : (
                          member.name.charAt(0)
                        )}
                      </div>
                      <div className="flex-1">
                        <h3 className="text-sm font-bold text-slate-900">
                          {member.name}
                        </h3>
                        {member.designation && (
                          <p className="text-xs text-slate-500 mt-0.5">
                            {member.designation}
                          </p>
                        )}
                        <span className="mt-2 inline-block rounded bg-indigo-50 px-2 py-0.5 text-[11px] font-semibold text-indigo-700">
                          {member.role}
                        </span>
                        {member.responsibilities?.length ? (
                          <ul className="mt-3 space-y-1 text-xs text-slate-600">
                            {member.responsibilities.map((item) => (
                              <li key={item} className="flex gap-2">
                                <span className="text-slate-300">•</span> {item}
                              </li>
                            ))}
                          </ul>
                        ) : null}
                        {member.email && (
                          <a
                            href={`mailto:${member.email}`}
                            className="mt-3 flex items-center gap-1.5 text-xs font-medium text-slate-500 hover:text-indigo-600"
                          >
                            <Mail size={12} /> {member.email}
                          </a>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </AdminCard>
            )
        )}

        {/* Technology Stack */}
        {ABOUT_CONFIG.technologyStack.length > 0 && (
          <AdminCard title="Technology Stack" icon={Layers}>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-8">
              {ABOUT_CONFIG.technologyStack.map((group) => {
                const Icon = technologyIcons[group.icon];
                return (
                  <div key={group.category}>
                    <div className="flex items-center gap-2 mb-3">
                      <Icon size={16} className="text-slate-400" />
                      <h3 className="font-semibold text-sm text-slate-900">
                        {group.category}
                      </h3>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {group.technologies.map((tech) => (
                        <span
                          key={tech}
                          className="rounded-md bg-slate-100 px-2 py-1 text-[11px] font-medium text-slate-700"
                        >
                          {tech}
                        </span>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </AdminCard>
        )}
      </div>
    </main>
  );
}
