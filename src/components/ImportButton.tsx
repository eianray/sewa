/**
 * ImportButton — M4 Boundary Import UI
 * =====================================
 *
 * A compact import control that lives in the ElementPalette sidebar.
 * Allows the user to upload a shapefile (.zip) or GeoJSON (.geojson/.json)
 * to define the project boundary polygon.
 *
 * ## Props
 *
 *   currentLabel : string | null
 *     The name of the currently loaded boundary, if any.
 *     Displayed as a badge on the button so the user can see what's loaded.
 *
 *   onImport : (fc: FeatureCollection, label: string) => void
 *     Called when a file is successfully parsed. The label is the
 *     original filename (minus extension), used as the boundary_label.
 *
 *   onClear : () => void
 *     Called when the user clicks the × to remove the current boundary.
 *
 * ## States
 *
 *   idle       → default button "Import Boundary"
 *   parsing    → loading state "Parsing…" (disabled, spinner)
 *   error      → inline error message below button, then reverts to idle
 *   hasLabel   → button shows the current label name + a × clear button
 */
"use client";

import { useState, useRef, useCallback } from "react";
import { parseUploadedFile } from "@/lib/geoImport";
import type { FeatureCollection } from "geojson";

interface ImportButtonProps {
  currentLabel: string | null;
  onImport: (fc: FeatureCollection, label: string) => void;
  onClear: () => void;
}

type ImportState = "idle" | "parsing" | "error";

export default function ImportButton({
  currentLabel,
  onImport,
  onClear,
}: ImportButtonProps) {
  const [state, setState] = useState<ImportState>("idle");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Hidden file input — clicking the button triggers this via ref
  const fileInputRef = useRef<HTMLInputElement>(null);

  /**
   * Handles the file selection from the hidden <input type="file">.
   * Parses the file and either calls onImport() with the parsed GeoJSON
   * or shows an error message.
   */
  const handleFileChange = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;

      setState("parsing");
      setErrorMsg(null);

      // Derive a human-readable label from the filename (strip extension)
      const label = file.name.replace(/\.(zip|geojson|json)$/i, "");

      const fc = await parseUploadedFile(file);

      if (fc) {
        onImport(fc, label);
        setState("idle");
      } else {
        setErrorMsg("Could not parse file — check format");
        setState("error");
      }

      // Reset the input so the same file can be selected again if needed
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    },
    [onImport]
  );

  const handleImportClick = useCallback(() => {
    // If a boundary is already loaded, show the clear option instead
    if (currentLabel) {
      onClear();
      return;
    }
    fileInputRef.current?.click();
  }, [currentLabel, onClear]);

  const isParsing = state === "parsing";

  return (
    <div className="px-4 pb-4">
      <p className="text-xs font-semibold text-[#94a3b8] uppercase tracking-wider mb-2">
        Boundary
      </p>

      {/* Hidden file input — accepts shapefile zips and GeoJSON */}
      <input
        ref={fileInputRef}
        type="file"
        accept=".zip,.geojson,.json"
        onChange={handleFileChange}
        className="hidden"
        aria-hidden="true"
      />

      {currentLabel ? (
        /* Boundary loaded: show label badge + clear button */
        <div className="flex items-center gap-2">
          <div className="flex-1 min-w-0 bg-[#111827] border border-[#1e293b] rounded-lg px-3 py-2">
            <p className="text-xs text-white truncate leading-tight" title={currentLabel}>
              {currentLabel}
            </p>
            <p className="text-[10px] text-[#38bdf8] mt-0.5">Boundary set</p>
          </div>
          <button
            onClick={onClear}
            title="Remove boundary"
            className="flex-shrink-0 w-7 h-7 rounded-lg bg-[#111827] border border-[#1e293b] text-[#94a3b8] hover:text-red-400 hover:border-red-500/50 transition-colors flex items-center justify-center"
          >
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
              <line x1="2" y1="2" x2="10" y2="10" />
              <line x1="10" y1="2" x2="2" y2="10" />
            </svg>
          </button>
        </div>
      ) : (
        /* No boundary: show the import button */
        <button
          onClick={handleImportClick}
          disabled={isParsing}
          className={`
            w-full flex items-center justify-center gap-2 rounded-lg px-4 py-2.5
            text-sm font-semibold transition-all border
            ${isParsing
              ? "opacity-60 cursor-not-allowed border-[#1e293b] text-[#94a3b8]"
              : "border-[#38bdf8]/40 text-[#38bdf8] hover:bg-[#38bdf8]/10 hover:border-[#38bdf8] active:scale-95"
            }
          `}
        >
          {isParsing ? (
            <>
              {/* Spinner during parse */}
              <div className="w-4 h-4 border-2 rounded-full animate-spin" style={{ borderColor: "#94a3b8", borderTopColor: "transparent" }} aria-hidden="true" />
              Parsing…
            </>
          ) : (
            <>
              {/* Upload icon */}
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
                <path d="M7 9V2M4 5l3-3 3 3" />
                <path d="M2 10h10v2H2z" fill="currentColor" stroke="none" opacity="0.3" />
              </svg>
              Import Boundary
            </>
          )}
        </button>
      )}

      {/* Error message — shown below the button */}
      {state === "error" && errorMsg && (
        <p className="mt-2 text-xs text-red-400" role="alert">
          {errorMsg}
        </p>
      )}

      {/* Supported formats hint */}
      {state === "idle" && !currentLabel && (
        <p className="mt-1.5 text-[10px] text-[#475569] text-center">
          .zip (shapefile) or .geojson
        </p>
      )}
    </div>
  );
}
