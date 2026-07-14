// import { useState, useRef, useEffect } from "react";
// import { createPortal } from "react-dom";
// import { Download, FileText, FileSpreadsheet, Loader2, CheckCircle, AlertCircle, Image as ImageIcon } from "lucide-react";
// import { useExportContext, type SupportedFormat } from "../../context/ExportContext";

// export default function ExportAnalysisButton() {
//   const { exportConfig } = useExportContext();
//   const [open, setOpen] = useState(false);
//   const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
//   const [errorMsg, setErrorMsg] = useState<string | null>(null);
//   const [clusterId, setClusterId] = useState<string>("");
//   const [pos, setPos] = useState<{ top: number; left: number; width: number } | null>(null);
  
//   const triggerRef = useRef<HTMLButtonElement>(null);
//   const menuRef = useRef<HTMLDivElement>(null);

//   const updatePosition = () => {
//     const el = triggerRef.current;
//     if (!el) return;
//     const rect = el.getBoundingClientRect();
//     // Position dropdown below the button, aligned to the right edge roughly
//     setPos({
//       top: rect.bottom + 8,
//       left: Math.max(8, rect.right - 220), 
//       width: 220,
//     });
//   };

//   useEffect(() => {
//     if (!open) return;
//     updatePosition();

//     const close = (e: MouseEvent) => {
//       if (
//         triggerRef.current?.contains(e.target as Node) ||
//         menuRef.current?.contains(e.target as Node)
//       ) return;
//       setOpen(false);
//     };
//     document.addEventListener("mousedown", close);
//     window.addEventListener("scroll", updatePosition, true);
//     window.addEventListener("resize", updatePosition);
//     return () => {
//       document.removeEventListener("mousedown", close);
//       window.removeEventListener("scroll", updatePosition, true);
//       window.removeEventListener("resize", updatePosition);
//     };
//   }, [open]);

//   useEffect(() => {
//     if (status === "success" || status === "error") {
//       const timer = setTimeout(() => {
//         setStatus("idle");
//         setErrorMsg(null);
//       }, 3000);
//       return () => clearTimeout(timer);
//     }
//   }, [status]);

//   if (!exportConfig || exportConfig.supportedFormats.length === 0) {
//     return null;
//   }

//   const handleExport = async (format: SupportedFormat) => {
//     setOpen(false);
//     setStatus("loading");
//     setErrorMsg(null);

//     try {
//       await exportConfig.onExport(format, {
//         clusterId: clusterId ? parseInt(clusterId, 10) : undefined,
//       });
//       setStatus("success");
//     } catch (err: unknown) {
//       const msg = err instanceof Error ? err.message : "Export failed. Please try again.";
//       setErrorMsg(msg);
//       setStatus("error");
//     }
//   };

//   const buttonLabel = () => {
//     switch (status) {
//       case "loading": return <><Loader2 size={13} className="animate-spin" />Exporting…</>;
//       case "success": return <><CheckCircle size={13} className="text-emerald-600" /><span className="text-emerald-700">Done!</span></>;
//       case "error": return <><AlertCircle size={13} className="text-red-500" /><span className="text-red-600">Failed</span></>;
//       default: return <><Download size={13} />Export Analysis</>;
//     }
//   };

//   const triggerClass = () => {
//     const base = "flex items-center justify-center gap-2 rounded-lg border px-4 py-2 text-[12px] font-semibold shadow-sm transition active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60 h-[34px]";
//     switch (status) {
//       case "success": return `${base} border-emerald-200 bg-emerald-50 text-emerald-700`;
//       case "error": return `${base} border-red-200 bg-red-50 text-red-600`;
//       case "loading": return `${base} border-[#E4E8F4] bg-white text-[#6B7299]`;
//       default: return `${base} border-[#E4E8F4] bg-white text-[#1e3a8a] hover:border-[#1e3a8a] hover:bg-[#EEF2FB]`;
//     }
//   };

//   return (
//     <div className="relative inline-block ml-auto my-auto h-full flex items-center">
//       <button
//         ref={triggerRef}
//         type="button"
//         disabled={status === "loading"}
//         onClick={() => { if (status === "idle") setOpen((v) => !v); }}
//         className={triggerClass()}
//       >
//         {buttonLabel()}
//       </button>

//       {open && pos && createPortal(
//         <div
//           ref={menuRef}
//           style={{
//             position: "fixed",
//             top: pos.top,
//             left: pos.left,
//             width: pos.width,
//             zIndex: 9999,
//           }}
//           className="rounded-xl border border-[#E4E8F4] bg-white shadow-xl overflow-hidden"
//         >
//           <div className="px-3 py-2 border-b border-[#F1F4FB] bg-[#F7F9FD]">
//             <p className="text-[10px] font-bold uppercase tracking-wider text-[#6B7299]">
//               Export Format
//             </p>
//           </div>
//           <div className="p-1.5 flex flex-col gap-1">
//             {exportConfig.allowClusterSelection && (
//               <div className="px-2 py-2 border-b border-[#F1F4FB] mb-1">
//                 <label className="text-[10px] font-bold text-[#6B7299] uppercase mb-1 block">Cluster No (Optional)</label>
//                 <input 
//                   type="number" 
//                   value={clusterId}
//                   onChange={(e) => setClusterId(e.target.value)}
//                   placeholder="e.g. 12"
//                   className="w-full text-[13px] border border-[#E4E8F4] rounded-lg px-2.5 py-1.5 focus:outline-none focus:border-[#2C6EF2]"
//                 />
//               </div>
//             )}
//             {exportConfig.supportedFormats.includes("csv") && (
//               <button onClick={() => handleExport("csv")} className="flex items-center gap-3 w-full rounded-lg px-3 py-2.5 text-left text-[13px] font-medium text-[#1A1D2E] hover:bg-[#EEF2FB] hover:text-[#1e3a8a] transition">
//                 <div className="h-8 w-8 flex items-center justify-center rounded-lg bg-orange-50 shrink-0">
//                   <FileText size={16} className="text-orange-500" />
//                 </div>
//                 <div>
//                   <p className="font-semibold text-[12px]">CSV File</p>
//                   <p className="text-[10px] text-[#9BA3C2]">Raw data</p>
//                 </div>
//               </button>
//             )}
//             {exportConfig.supportedFormats.includes("excel") && (
//               <button onClick={() => handleExport("excel")} className="flex items-center gap-3 w-full rounded-lg px-3 py-2.5 text-left text-[13px] font-medium text-[#1A1D2E] hover:bg-[#EEF2FB] hover:text-[#1e3a8a] transition">
//                 <div className="h-8 w-8 flex items-center justify-center rounded-lg bg-green-50 shrink-0">
//                   <FileSpreadsheet size={16} className="text-green-600" />
//                 </div>
//                 <div>
//                   <p className="font-semibold text-[12px]">Excel File</p>
//                   <p className="text-[10px] text-[#9BA3C2]">Formatted workbook</p>
//                 </div>
//               </button>
//             )}
//             {exportConfig.supportedFormats.includes("png") && (
//               <button onClick={() => handleExport("png")} className="flex items-center gap-3 w-full rounded-lg px-3 py-2.5 text-left text-[13px] font-medium text-[#1A1D2E] hover:bg-[#EEF2FB] hover:text-[#1e3a8a] transition">
//                 <div className="h-8 w-8 flex items-center justify-center rounded-lg bg-blue-50 shrink-0">
//                   <ImageIcon size={16} className="text-blue-500" />
//                 </div>
//                 <div>
//                   <p className="font-semibold text-[12px]">Image (PNG)</p>
//                   <p className="text-[10px] text-[#9BA3C2]">Map snapshot</p>
//                 </div>
//               </button>
//             )}
//           </div>
//           {status === "error" && errorMsg && (
//             <div className="p-2 bg-red-50 border-t border-red-100">
//               <p className="text-[10px] text-red-600 leading-snug">{errorMsg}</p>
//             </div>
//           )}
//         </div>,
//         document.body
//       )}
//     </div>
//   );
// }
