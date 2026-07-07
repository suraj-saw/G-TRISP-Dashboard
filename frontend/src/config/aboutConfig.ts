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
}

export interface AboutTechnologyCategory {
  category: string;
  icon: "layout" | "server" | "database" | "map" | "cloud";
  technologies: string[];
}

export const ABOUT_CONFIG = {
  project: {
    name: "G-TRISP",
    fullName: "Traffic and Road Incident Safety Platform",
    description:
      "A district-level road safety intelligence platform that combines GIS visualization, statistical insights, and temporal analysis to support evidence-based planning and decision-making.",
    mark: "GT",
    metadata: [
      { label: "Project name", value: "G-TRISP" },
      { label: "Project type", value: "Government & research analytics" },
      { label: "Platform", value: "Responsive web application" },
      { label: "Current version", value: "1.0.0" },
      { label: "Development status", value: "Active development" },
      { label: "Release year", value: "2026" },
    ] satisfies AboutMetadataItem[],
  },
  organizations: [
    {
      name: "Sardar Vallabhbhai National Institute of Technology, Surat",
      type: "Academic institution",
      description:
        "Supporting research and technology development for safer, data-informed transport systems.",
      website: "https://www.svnit.ac.in/",
    },
  ] as AboutOrganization[],
  teamGroups: [
    {
      title: "Project Supervision",
      members: [
        {
          name: "Dr. [Professor Name]",
          designation: "Professor",
          role: "Principal Investigator & Project Advisor",
          responsibilities: [
            "Project conceptualization and academic guidance",
            "Research methodology and institutional oversight",
          ],
          email: "professor@svnit.ac.in",
        },
      ],
    },
    {
      title: "Development Team",
      members: [
        {
          name: "Suraj Kumar Saw",
          role: "Lead Full-Stack Developer",
          responsibilities: [
            "Platform architecture and system design",
            "Dashboard engineering and data visualization",
          ],
          email: "suraj@example.com",
        },
        {
          name: "Harsh Kakkad",
          role: "Backend & Systems Engineer",
          responsibilities: [
            "API development and database management",
            "Authentication and security implementation",
          ],
          email: "harshkakkad25@gmail.com",
        },
        {
          name: "[Developer 3 Name]",
          role: "GIS & Analytics Developer",
          responsibilities: [
            "Spatial data processing and mapping",
            "GIS analytics and platform integration",
          ],
          email: "dev3@example.com",
        },
      ],
    },
  ] as { title: string; members: AboutTeamMember[] }[],
  technologyStack: [
    {
      category: "Frontend",
      icon: "layout",
      technologies: ["React", "TypeScript", "Vite", "Tailwind CSS", "Recharts"],
    },
    {
      category: "Backend",
      icon: "server",
      technologies: ["FastAPI", "Python", "SQLAlchemy"],
    },
    {
      category: "Database",
      icon: "database",
      technologies: ["PostgreSQL", "PostGIS"],
    },
    {
      category: "GIS & Analytics",
      icon: "map",
      technologies: [
        "MapLibre GL",
        "GeoJSON",
        "Spatial clustering",
        "KDE analysis",
      ],
    },
    {
      category: "Deployment",
      icon: "cloud",
      technologies: ["Docker", "Nginx"],
    },
  ] satisfies AboutTechnologyCategory[],
  contact: {
    institution: "Sardar Vallabhbhai National Institute of Technology, Surat",
    website: "https://www.svnit.ac.in/",
    address: "Ichchhanath, Surat, Gujarat 395007, India",
  },
} as const;
