/**
 * @file AboutPage.tsx
 * @description Renders the "About" page for the dashboard application.
 * @responsibility Displays project metadata, institutional support, contact information, team members, and the technology stack based on configuration data.
 * @dependencies react-router-dom (navigation), lucide-react (icons), aboutConfig (content data)
 */
import { useNavigate } from "react-router-dom";
import {
  ArrowLeft,
  Building2,
  Cloud,
  Code2,
  Database,
  ExternalLink,
  Globe2,
  Mail,
  Map,
  MapPinned,
  Server,
  Users,
  Briefcase,
  Layers,
  ShieldCheck,
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

/**
 * AdminCard Component
 * @description A reusable card wrapper for rendering distinct sections on the About page.
 * @param {Object} props - Component properties.
 * @param {string} props.title - The title displayed in the card header.
 * @param {React.ElementType} [props.icon] - Optional Lucide React icon component for the header.
 * @param {React.ReactNode} props.children - The content to render inside the card body.
 * @returns {JSX.Element} The styled card container.
 */
function AdminCard({
  title,
  icon: Icon,
  children,
  action,
}: {
  title: string;
  icon?: React.ElementType;
  children: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <div className="bg-white border border-slate-200 rounded-xl shadow-sm flex flex-col">
      <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          {Icon && <Icon size={20} className="text-indigo-600" />}
          <h2 className="text-base font-bold text-slate-800">{title}</h2>
        </div>
        {action}
      </div>
      <div className="p-6 flex-1">{children}</div>
    </div>
  );
}

/**
 * AboutPage Component
 * @component_responsibility Main entry point for the About page. Orchestrates the layout of various informational sections (Banner, Overview, Org/Contact grid, Teams, Tech Stack).
 * @state_management Uses static configuration data (`ABOUT_CONFIG`) without local state.
 * @hooks_usage Uses `useNavigate` to provide a "Back to Dashboard" routing mechanism.
 * @rendering_flow Iterates through configuration arrays to dynamically construct cards for organizations, team groups, and technology stacks.
 * @returns {JSX.Element} The fully composed About page.
 */
export default function AboutPage() {
  const navigate = useNavigate();
  const { project, organizations } = ABOUT_CONFIG;

  const sponsorOrg =
    organizations.find(
      (org) =>
        org.name.toLowerCase().includes("police") ||
        org.type?.toLowerCase().includes("sponsor")
    ) || organizations[0];

  const academicOrg =
    organizations.find(
      (org) =>
        org.name.toLowerCase().includes("technology") ||
        org.type?.toLowerCase().includes("academic")
    ) || organizations[1];

  return (
    <main className="min-h-screen bg-slate-50 text-slate-900 pb-16 font-sans">
      {/* Top Navigation Bar with Official Brand Logo */}
      <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/90 backdrop-blur-md shadow-xs">
        <div className="mx-auto flex h-[52px] max-w-[1536px] items-center justify-between px-6 lg:px-8">
          <div className="flex items-center gap-3.5">
            <button
              type="button"
              onClick={() => navigate(ROUTES.HOME_PAGE)}
              className="flex items-center rounded-lg text-left transition-all hover:opacity-85 active:scale-98 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 cursor-pointer group"
              title="Go to Landing Page"
              aria-label="Go to Landing Page"
            >
              <h1 className="sr-only">ASTRA (अस्त्र)</h1>
              <img
                src="/logos/astra_topbar_brand.png?v=3"
                alt="ASTRA (अस्त्र)"
                className="h-[18px] md:h-[20px] w-auto object-contain select-none transition-transform duration-200 group-hover:scale-[1.02]"
                onError={(e) => {
                  (e.currentTarget as HTMLImageElement).src = "/api/images/astra_topbar_brand?v=3";
                }}
              />
            </button>
          </div>

          <button
            onClick={() => {
              if (window.history.length > 1) {
                navigate(-1);
              } else {
                navigate(ROUTES.DASHBOARD);
              }
            }}
            className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3.5 py-1.5 sm:px-4 sm:py-2 text-xs sm:text-sm font-semibold text-slate-700 transition-all hover:bg-slate-50 hover:text-indigo-600 shadow-2xs active:scale-98 cursor-pointer"
          >
            <ArrowLeft size={16} /> Back to Dashboard
          </button>
        </div>
      </header>

      <div className="mx-auto w-[80%] max-w-[1536px] pt-8 space-y-6">
        {/* Hero Section (Light & Clean) */}
        <section
          id="overview"
          className="bg-white border border-slate-200 rounded-2xl p-6 sm:p-8 lg:p-10 shadow-xs"
        >
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-8">
            <div className="max-w-2xl">
              <h1 className="text-2xl sm:text-3xl lg:text-4xl font-extrabold tracking-tight text-slate-900">
                ASTRA <span className="text-indigo-600 font-bold">(अस्त्र)</span>
              </h1>

              <p className="mt-1 text-base sm:text-lg font-medium text-slate-600">
                {project.fullName}
              </p>

              <p className="mt-3 text-sm sm:text-base leading-relaxed text-slate-500 max-w-2xl">
                {project.description}
              </p>
            </div>

            {/* Logos: Platform Emblem, Sponsor Police Logo & Academic Institution SVNIT Logo */}
            <div className="flex shrink-0 items-center gap-3.5 sm:gap-5 self-start md:self-center">
              <img
                src="/logos/astra_logo_emblem.png"
                alt="ASTRA Emblem"
                className="h-20 w-20 sm:h-24 sm:w-24 md:h-28 md:w-28 object-contain select-none"
                onError={(e) => {
                  (e.currentTarget as HTMLImageElement).src = "/api/images/astra_logo_emblem";
                }}
              />

              <div className="h-12 sm:h-14 w-px bg-slate-200" />

              <img
                src="/logos/gujarat_police_logo.png"
                alt="Gujarat Police - Western Railway"
                className="h-20 w-20 sm:h-24 sm:w-24 md:h-28 md:w-28 object-contain select-none"
                onError={(e) => {
                  (e.currentTarget as HTMLImageElement).src = "/api/images/gujarat_police_logo";
                }}
              />

              <div className="h-12 sm:h-14 w-px bg-slate-200" />

              <img
                src="/logos/svnit_logo.svg"
                alt="SVNIT Surat"
                className="h-20 w-20 sm:h-24 sm:w-24 md:h-28 md:w-28 object-contain select-none"
              />
            </div>
          </div>
        </section>

        {/* Research Support Section */}
        {sponsorOrg && (
          <div id="research-support" className="scroll-mt-20">
            <AdminCard title="Research Support Agency" icon={ShieldCheck}>
              <div className="flex flex-col sm:flex-row items-center sm:items-start gap-6 sm:gap-8">
                {/* Left Side: Police Logo */}
                <div className="flex shrink-0 flex-col items-center justify-center">
                  <div className="h-28 w-28 sm:h-36 sm:w-36 md:h-40 md:w-40 flex items-center justify-center rounded-2xl bg-slate-50/80 border border-slate-200/80 p-3 shadow-xs">
                    <img
                      src="/logos/gujarat_police_logo.png"
                      alt={sponsorOrg.name}
                      className="h-full w-full object-contain select-none"
                      onError={(e) => {
                        (e.currentTarget as HTMLImageElement).src = "/api/images/gujarat_police_logo";
                      }}
                    />
                  </div>
                  <span className="mt-2 text-[11px] font-semibold text-slate-500 uppercase tracking-wider text-center">
                    Gujarat Police
                  </span>
                </div>

                {/* Right Side: Information */}
                <div className="flex-1 min-w-0 flex flex-col justify-between self-stretch">
                  <div>
                    {sponsorOrg.type && (
                      <span className="text-[11px] font-bold uppercase tracking-wider text-indigo-600 mb-1 block">
                        {sponsorOrg.type}
                      </span>
                    )}
                    <h3 className="text-lg sm:text-xl font-bold text-slate-900">
                      {sponsorOrg.name}
                    </h3>
                    {sponsorOrg.department && (
                      <p className="text-sm font-semibold text-slate-700 mt-0.5">
                        {sponsorOrg.department}
                      </p>
                    )}
                    {sponsorOrg.description && (
                      <p className="text-sm sm:text-[15px] text-slate-600 mt-3 leading-relaxed">
                        {sponsorOrg.description}
                      </p>
                    )}
                  </div>

                  {sponsorOrg.website && (
                    <div className="mt-4 pt-4 border-t border-slate-100 flex items-center justify-between">
                      <a
                        href={sponsorOrg.website}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1.5 text-sm font-semibold text-indigo-600 hover:text-indigo-800 transition-colors"
                      >
                        Visit official portal <ExternalLink size={14} />
                      </a>
                    </div>
                  )}
                </div>
              </div>
            </AdminCard>
          </div>
        )}

        {/* Institutional Support Section */}
        {academicOrg && (
          <div id="institutional-support" className="scroll-mt-20">
            <AdminCard title="Institutional Support" icon={Building2}>
              <div className="flex flex-col lg:flex-row items-center lg:items-start gap-6 lg:gap-8">
                {/* Left Side: SVNIT Logo & Director Photo side by side */}
                <div className="flex shrink-0 items-start justify-center gap-4 sm:gap-6">
                  {/* SVNIT Logo */}
                  <div className="flex flex-col items-center">
                    <div className="h-28 w-28 sm:h-32 sm:w-32 md:h-36 md:w-36 flex items-center justify-center rounded-2xl bg-white border border-slate-200/80 p-3 shadow-xs">
                      <img
                        src="/logos/svnit_logo.svg"
                        alt={academicOrg.name}
                        className="h-full w-full object-contain select-none"
                      />
                    </div>
                    <span className="mt-2 text-xs font-bold text-slate-800 text-center leading-tight">
                      SVNIT Surat
                    </span>
                  </div>

                  {/* Dr. Anupam Shukla Photo (just right of SVNIT logo) */}
                  {academicOrg.patron && (
                    <div className="flex flex-col items-center">
                      <div className="h-28 w-28 sm:h-32 sm:w-32 md:h-36 md:w-36 overflow-hidden rounded-2xl bg-slate-100 border border-slate-200/80 shadow-xs">
                        {academicOrg.patron.photo ? (
                          <img
                            src={academicOrg.patron.photo}
                            alt={academicOrg.patron.name}
                            className="h-full w-full object-cover object-top select-none"
                          />
                        ) : (
                          <div className="h-full w-full flex items-center justify-center text-slate-600 font-bold text-2xl">
                            {academicOrg.patron.name.charAt(0)}
                          </div>
                        )}
                      </div>
                      <span className="mt-2 text-xs font-bold text-slate-800 text-center leading-tight">
                        {academicOrg.patron.name}
                      </span>
                      <span className="text-[11px] font-medium text-slate-500 text-center mt-0.5">
                        Director & Patron
                      </span>
                    </div>
                  )}
                </div>

                {/* Right Side: Information */}
                <div className="flex-1 min-w-0 flex flex-col justify-between self-stretch pt-0.5">
                  <div>
                    {academicOrg.type && (
                      <span className="text-[11px] font-bold uppercase tracking-wider text-indigo-600 block mb-1">
                        {academicOrg.type}
                      </span>
                    )}
                    <h3 className="text-lg sm:text-xl font-bold text-slate-900 leading-snug">
                      {academicOrg.name}
                    </h3>
                    {academicOrg.department && (
                      <p className="text-sm font-semibold text-slate-700 mt-1">
                        {academicOrg.department}
                      </p>
                    )}
                    {academicOrg.description && (
                      <p className="text-sm sm:text-[15px] text-slate-600 mt-2.5 leading-relaxed">
                        {academicOrg.description}
                      </p>
                    )}
                  </div>

                  {/* Clean Bottom Metadata & Actions Bar */}
                  <div className="mt-5 pt-3.5 border-t border-slate-100 flex flex-wrap items-center justify-between gap-y-2 gap-x-4 text-xs">
                    {academicOrg.patron?.email && (
                      <a
                        href={`mailto:${academicOrg.patron.email}`}
                        className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-500 hover:text-indigo-600 transition-colors"
                      >
                        <Mail size={13} className="text-slate-400" /> {academicOrg.patron.email}
                      </a>
                    )}

                    {academicOrg.website && (
                      <a
                        href={academicOrg.website}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1.5 text-xs sm:text-sm font-semibold text-indigo-600 hover:text-indigo-800 transition-colors group sm:ml-auto"
                      >
                        Visit official portal <ExternalLink size={13} className="transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
                      </a>
                    )}
                  </div>
                </div>
              </div>
            </AdminCard>
          </div>
        )}

        {/* Project Team Section (Following Reference Layout) */}
        {(() => {
          const supervisionGroup = ABOUT_CONFIG.teamGroups.find((g) =>
            g.title.toLowerCase().includes("supervision")
          );
          const devGroup =
            ABOUT_CONFIG.teamGroups.find((g) =>
              g.title.toLowerCase().includes("development")
            ) ||
            ABOUT_CONFIG.teamGroups.find(
              (g) => !g.title.toLowerCase().includes("supervision")
            );

          return (
            <div id="team" className="scroll-mt-20">
              <AdminCard
                title="Project Team"
                icon={Users}
                action={
                  <span className="hidden sm:inline-block text-xs sm:text-sm text-slate-500 font-normal">
                    Supervision and the development team behind ASTRA.
                  </span>
                }
              >
                {/* Supervision (Top Row) */}
                {supervisionGroup && supervisionGroup.members.length > 0 && (
                  <div className="space-y-6">
                    {supervisionGroup.members.map((member) => (
                      <div
                        key={member.name}
                        className="flex flex-col sm:flex-row items-center sm:items-start gap-5 sm:gap-7"
                      >
                        <div className="flex shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-slate-100 font-bold text-slate-600 border border-slate-200/80 shadow-xs h-28 w-28 sm:h-32 sm:w-32 md:h-36 md:w-36 text-2xl">
                          {member.photo ? (
                            <img
                              src={member.photo}
                              alt={member.name}
                              className="h-full w-full object-cover object-top select-none"
                            />
                          ) : (
                            member.name.charAt(0)
                          )}
                        </div>
                        <div className="flex-1 min-w-0 flex flex-col justify-center text-center sm:text-left pt-1">
                          {member.role && (
                            <span className="text-[11px] font-bold uppercase tracking-wider text-indigo-600 mb-1 block">
                              {member.role}
                            </span>
                          )}
                          <h3 className="font-bold text-slate-900 text-xl sm:text-2xl leading-snug">
                            {member.name}
                          </h3>
                          {member.designation && (
                            <p className="text-sm font-semibold text-slate-600 mt-1">
                              {member.designation.includes("SVNIT")
                                ? member.designation
                                : `${member.designation}, SVNIT Surat`}
                            </p>
                          )}
                          {(member.email || member.website) && (
                            <div className="mt-3.5 flex flex-wrap items-center justify-center sm:justify-start gap-x-4 gap-y-2 text-xs">
                              {member.email && (
                                <a
                                  href={`mailto:${member.email}`}
                                  className="inline-flex items-center gap-1.5 font-medium text-slate-500 hover:text-indigo-600 transition-colors"
                                >
                                  <Mail size={13} className="text-slate-400" /> {member.email}
                                </a>
                              )}
                              {member.website && (
                                <a
                                  href={member.website}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="inline-flex items-center gap-1 font-semibold text-indigo-600 hover:text-indigo-800 transition-colors"
                                >
                                  Website <ExternalLink size={12} />
                                </a>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {/* Divider between Supervision and Development Team */}
                {supervisionGroup && devGroup && (
                  <div className="my-8 border-t border-slate-100" />
                )}

                {/* Development Team Grid (4 Columns as in Reference) */}
                {devGroup && devGroup.members.length > 0 && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 sm:gap-8">
                    {devGroup.members.map((member) => (
                      <div key={member.name} className="flex flex-col items-center text-center">
                        <div className="h-32 w-32 sm:h-36 sm:w-36 md:h-40 md:w-40 overflow-hidden rounded-2xl bg-slate-100 border border-slate-200/80 shadow-xs">
                          {member.photo ? (
                            <img
                              src={member.photo}
                              alt={member.name}
                              className="h-full w-full object-cover object-top select-none"
                            />
                          ) : (
                            <div className="h-full w-full flex items-center justify-center text-slate-400 font-bold text-3xl">
                              {member.name.charAt(0)}
                            </div>
                          )}
                        </div>
                        <div className="mt-3.5 flex flex-col items-center flex-1 w-full">
                          <h4 className="font-bold text-slate-900 text-sm sm:text-base leading-snug">
                            {member.name}
                          </h4>
                          {member.designation && (
                            <p className="text-xs text-slate-500 mt-0.5 leading-relaxed">
                              {member.designation}
                            </p>
                          )}
                          {member.role && (
                            <p className="text-xs font-semibold text-indigo-600 mt-1.5 leading-snug">
                              {member.role}
                            </p>
                          )}
                          {member.email && (
                            <a
                              href={`mailto:${member.email}`}
                              className="mt-2.5 inline-flex items-center justify-center gap-1.5 text-xs text-slate-400 hover:text-indigo-600 transition-colors"
                            >
                              <Mail size={12} className="shrink-0" />
                              <span>{member.email}</span>
                            </a>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </AdminCard>
            </div>
          );
        })()}

        {/* Technology Stack */}
        {ABOUT_CONFIG.technologyStack.length > 0 && (
          <div id="tech-stack" className="scroll-mt-20">
            <AdminCard title="Technology Stack" icon={Layers}>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-8">
                {ABOUT_CONFIG.technologyStack.map((group) => {
                  const Icon = technologyIcons[group.icon];
                  return (
                    <div key={group.category} className="flex flex-col">
                      <div className="flex items-center gap-2 mb-3">
                        <div className="p-1 rounded-md bg-indigo-50 text-indigo-600">
                          <Icon size={15} />
                        </div>
                        <h3 className="font-bold text-sm text-slate-900">
                          {group.category}
                        </h3>
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {group.technologies.map((tech) => (
                          <span
                            key={tech}
                            className="rounded-md bg-slate-50 border border-slate-200/70 px-2.5 py-1 text-[11px] font-medium text-slate-700 shadow-2xs hover:border-indigo-200 hover:text-indigo-700 transition-colors"
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
          </div>
        )}

        {/* Contact Information Section (Full Width at End of Page) */}
        <div id="contact" className="scroll-mt-20">
          <AdminCard title="Contact Information" icon={Mail}>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
              {ABOUT_CONFIG.contact.institution && (
                <div className="flex gap-3.5">
                  <div className="p-2 rounded-lg bg-indigo-50 text-indigo-600 shrink-0 self-start">
                    <Building2 size={18} />
                  </div>
                  <div>
                    <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                      Institution
                    </p>
                    <p className="text-sm font-semibold text-slate-900 mt-0.5">
                      {ABOUT_CONFIG.contact.institution}
                    </p>
                    {ABOUT_CONFIG.contact.department && (
                      <p className="text-xs text-slate-500 mt-0.5">
                        {ABOUT_CONFIG.contact.department}
                      </p>
                    )}
                  </div>
                </div>
              )}

              {ABOUT_CONFIG.contact.address && (
                <div className="flex gap-3.5">
                  <div className="p-2 rounded-lg bg-indigo-50 text-indigo-600 shrink-0 self-start">
                    <MapPinned size={18} />
                  </div>
                  <div>
                    <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                      Office Address
                    </p>
                    <p className="text-sm text-slate-700 mt-0.5 leading-relaxed">
                      {ABOUT_CONFIG.contact.address}
                    </p>
                  </div>
                </div>
              )}

              {ABOUT_CONFIG.contact.email && (
                <div className="flex gap-3.5">
                  <div className="p-2 rounded-lg bg-indigo-50 text-indigo-600 shrink-0 self-start">
                    <Mail size={18} />
                  </div>
                  <div>
                    <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                      Project Inquiries
                    </p>
                    <a
                      href={`mailto:${ABOUT_CONFIG.contact.email}`}
                      className="text-sm font-medium text-indigo-600 hover:underline mt-0.5 block"
                    >
                      {ABOUT_CONFIG.contact.email}
                    </a>
                  </div>
                </div>
              )}

              {ABOUT_CONFIG.contact.website && (
                <div className="flex gap-3.5">
                  <div className="p-2 rounded-lg bg-indigo-50 text-indigo-600 shrink-0 self-start">
                    <Globe2 size={18} />
                  </div>
                  <div>
                    <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                      Official Portal
                    </p>
                    <a
                      href={ABOUT_CONFIG.contact.website}
                      target="_blank"
                      rel="noreferrer"
                      className="text-sm font-medium text-indigo-600 hover:underline mt-0.5 inline-flex items-center gap-1"
                    >
                      svnit.ac.in <ExternalLink size={13} />
                    </a>
                  </div>
                </div>
              )}
            </div>
          </AdminCard>
        </div>
      </div>
    </main>
  );
}
