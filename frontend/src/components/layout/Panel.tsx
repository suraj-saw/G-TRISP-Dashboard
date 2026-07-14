// import { motion } from "framer-motion";
// import type { ReactNode } from "react";

// interface PanelProps {
//   title: string;
//   icon?: ReactNode;
//   delay?: number;
//   children: ReactNode;
//   className?: string;
// }

// export const Panel = ({ title, icon, delay = 0, children, className = "" }: PanelProps) => {
//   return (
//     <motion.div
//       initial={{ opacity: 0, y: 15 }}
//       animate={{ opacity: 1, y: 0 }}
//       transition={{ duration: 0.4, delay, ease: "easeOut" }}
//       className={`flex flex-col rounded-xl border border-[#E4E8F4] bg-white p-5 shadow-sm ${className}`}
//     >
//       <div className="mb-4 flex items-center gap-2">
//         {icon && <div className="text-[#2C6EF2]">{icon}</div>}
//         <h3 className="text-sm font-bold text-[#1A1D2E]">{title}</h3>
//       </div>
//       <div className="flex-1 w-full">
//         {children}
//       </div>
//     </motion.div>
//   );
// };
