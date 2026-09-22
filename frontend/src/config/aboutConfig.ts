import { APP_CONFIG } from "./constants";

export interface AboutMetadataItem {
  label: string;
  value: string;
}

export interface AboutOrganization {
  name: string;
  type?: string;
  department?: string;
  group?: string;
  description?: string;
  website?: string;
}

export interface AboutTeamMember {
  name: string;
  designation?: string;
  role: string;
  responsibilities?: string[];
  photo?: string;
  email?: string;
  website?: string;
}

export interface AboutTechnologyCategory {
  category: string;
  icon: "layout" | "server" | "database" | "map" | "cloud";
  technologies: string[];
}

export const ABOUT_CONFIG = {
  project: {
    name: APP_CONFIG.displayName,
    fullName: APP_CONFIG.fullName,
    description:
      "An integrated road safety intelligence platform designed to monitor, evaluate, and prevent traffic accidents across Gujarat through spatial modeling, blackspot detection, and temporal analytics.",
    mark: APP_CONFIG.name,
    metadata: [
      { label: "Project type", value: "Research project" },
      { label: "Project sponsor", value: "Superintendent of Police (SP), Western Railway" },
      { label: "Current version", value: "1.0.0" },
      { label: "Development status", value: "Active development" },
      { label: "Release year", value: "" },
    ] satisfies AboutMetadataItem[],
  },
  organizations: [
    {
      name: "Superintendent of Police (SP), Western Railway",
      type: "Project Sponsoring Authority",
      department: "Western Railway Police Division · Gujarat Police",
      description:
        "Sponsoring authority driving evidence-based road and transport safety analytics across Gujarat. Provides incident reporting jurisdiction data, field operational support, and strategic oversight for the systematic identification and remediation of high-risk accident corridors and railway level-crossing blackspots.",
      website: "https://police.gujarat.gov.in/",
    },
    {
      name: "Sardar Vallabhbhai National Institute of Technology, Surat",
      type: "Academic & Research Institution",
      department: "Department of Civil Engineering · Transportation Engineering Section",
      description:
        "An Institute of National Importance under the Ministry of Education, Government of India. Leads academic research, advanced GIS spatiotemporal modeling, Kernel Density Estimation (KDE), MoRTH & IRC:131 blackspot detection algorithms, and the end-to-end software architecture for ASTRA.",
      website: "https://www.svnit.ac.in/",
    },
  ] as AboutOrganization[],
  teamGroups: [
    {
      title: "Project Supervision",
      members: [
        {
          name: "Dr. Anupam Shukla",
          designation: "Director, SVNIT Surat",
          role: "Institutional Patron & Leadership",
          photo: "/team/dr_anupam_shukla.png",
          email: "director@svnit.ac.in",
        },
        {
          name: "Dr. Shrinivas S. Arkatkar",
          designation: "Professor, Department of Civil Engineering",
          role: "Principal Investigator & Project Supervisor",
          photo: "/team/dr_shrinivas_arkatkar.png",
          email: "sarkatkar@ced.svnit.ac.in",
          website: "https://shriniwasprofile.wordpress.com/",
        },
      ],
    },
    {
      title: "Development Team",
      members: [
        {
          name: "Mr. Vishal Patel",
          designation: "Research Scholar, SVNIT",
          role: "Research & Safety Analytics",
          photo: "/team/mr_vishal_patel.jpeg",
          email: "abc@gmail.com",
        },
        {
          name: "Mr. Mihir Koladiya",
          designation: "Project Engineer, SVNIT",
          role: "Transportation Engineer | GIS & Spatial Data Analyst",
          photo: "/team/mr_mihir_koladiya.jpeg",
          email: "koladiyamihir5212@gmail.com",
        },
        {
          name: "Mr. Harsh Kakkad",
          designation: "Project Engineer, SVNIT",
          role: "AI/ML Engineer | Backend Support",
          photo: "/team/mr_harsh_kakkad.jpeg",
          email: "harshkakkad25@gmail.com",
        },
        {
          name: "Mr. Suraj Kumar Saw",
          designation: "B.Tech. Student, NIT Delhi",
          role: "Lead Full-Stack Developer",
          photo: "/team/mr_suraj_kumar_saw.jpg",
          email: "suraj03saw@gmail.com",
        },
      ],
    },
  ] as { title: string; members: AboutTeamMember[] }[],
  technologyStack: [
    {
      category: "Frontend",
      icon: "layout",
      technologies: [
        "React 19",
        "TypeScript",
        "Vite",
        "Tailwind CSS",
        "Recharts",
        "Framer Motion",
        "Lucide Icons",
      ],
    },
    {
      category: "Backend",
      icon: "server",
      technologies: [
        "FastAPI",
        "Python",
        "SQLAlchemy",
        "Pydantic",
        "Uvicorn",
        "JWT Auth",
      ],
    },
    {
      category: "Database",
      icon: "database",
      technologies: [
        "PostgreSQL",
        "PostGIS",
        "Redis",
        "GiST Spatial Indexing",
      ],
    },
    {
      category: "GIS & Analytics",
      icon: "map",
      technologies: [
        "MapLibre GL",
        "Turf.js",
        "GeoJSON",
        "KDE Heatmaps",
        "MoRTH / IRC:131 Blackspots",
        "DBSCAN Clustering",
      ],
    },
    {
      category: "Deployment",
      icon: "cloud",
      technologies: [
        "Docker",
        "Nginx",
        "Ubuntu Linux",
        "Git",
      ],
    },
  ] satisfies AboutTechnologyCategory[],
  contact: {
    institution: "Sardar Vallabhbhai National Institute of Technology, Surat",
    department: "Department of Civil Engineering (Transportation Engineering Section)",
    address: "Ichchhanath, Surat, Gujarat 395007, India",
    email: "sarkatkar@ced.svnit.ac.in",
    website: "https://www.svnit.ac.in/",
  },
} as const;
