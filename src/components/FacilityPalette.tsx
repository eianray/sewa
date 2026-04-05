"use client";

import { useState } from "react";
import type { Facility, FacilityType } from "@/types/facility";
import { FACILITY_TYPE_LABELS } from "@/types/facility";

interface FacilityPaletteProps {
  facilities: Facility[];
  onFacilityAdd: (facility: Facility) => void;
  onAddFacilityClick: () => void;
}

export default function FacilityPalette({
  facilities,
  onFacilityAdd,
  onAddFacilityClick,
}: FacilityPaletteProps) {
  return (
    <div className="p-4 border-b border-[#1e293b]">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-xs font-semibold text-[#94a3b8] uppercase tracking-wider">
          Facilities
        </h3>
        <span className="text-xs px-2 py-0.5 rounded-full bg-[#3b82f6]/20 text-[#3b82f6] font-medium">
          {facilities.length}
        </span>
      </div>
      <button
        onClick={onAddFacilityClick}
        className="w-full flex items-center justify-center gap-2 rounded-lg bg-[#3b82f6] text-[#0a0f1e] py-2 text-xs font-semibold hover:bg-[#2563eb] transition-colors"
      >
        <span>＋</span>
        Add Facility
      </button>
    </div>
  );
}

// Modal for adding a facility at a clicked map location
interface AddFacilityModalProps {
  lat: number;
  lng: number;
  existingCount: number;
  onConfirm: (data: { name: string; facility_type: FacilityType }) => void;
  onCancel: () => void;
}

export function AddFacilityModal({
  lat,
  lng,
  existingCount,
  onConfirm,
  onCancel,
}: AddFacilityModalProps) {
  const [name, setName] = useState("");
  const [facilityType, setFacilityType] = useState<FacilityType>("other");

  const facilityId = `FAC-${String(existingCount + 1).padStart(3, "0")}`;

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    onConfirm({ name: name.trim(), facility_type: facilityType });
  }

  return (
    <div className="fixed inset-0 z-[2000] flex items-center justify-center bg-black/60">
      <div className="bg-[#0d1526] border border-[#1e293b] rounded-xl shadow-2xl w-80 overflow-hidden">
        <div className="px-4 py-3 border-b border-[#1e293b]">
          <h2 className="text-sm font-semibold text-white">Add Facility</h2>
          <p className="text-xs text-[#475569] mt-0.5">
            {lat.toFixed(6)}, {lng.toFixed(6)}
          </p>
        </div>
        <form onSubmit={handleSubmit} className="p-4 space-y-3">
          <div>
            <label className="block text-xs text-[#94a3b8] mb-1">Facility ID</label>
            <input
              type="text"
              value={facilityId}
              disabled
              className="w-full rounded bg-[#1e293b]/50 border border-[#1e293b] text-[#475569] text-sm px-3 py-2 cursor-not-allowed"
            />
          </div>
          <div>
            <label className="block text-xs text-[#94a3b8] mb-1">Name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Gault's Gulch WWTP"
              className="w-full rounded bg-[#111827] border border-[#1e293b] text-white text-sm px-3 py-2 placeholder-[#475569] focus:outline-none focus:border-[#38bdf8]"
              autoFocus
              required
            />
          </div>
          <div>
            <label className="block text-xs text-[#94a3b8] mb-1">Type</label>
            <select
              value={facilityType}
              onChange={(e) => setFacilityType(e.target.value as FacilityType)}
              className="w-full rounded bg-[#111827] border border-[#1e293b] text-white text-sm px-3 py-2 focus:outline-none focus:border-[#38bdf8]"
            >
              {(Object.keys(FACILITY_TYPE_LABELS) as FacilityType[]).map((t) => (
                <option key={t} value={t}>{FACILITY_TYPE_LABELS[t]}</option>
              ))}
            </select>
          </div>
          <div className="flex gap-2 pt-1">
            <button
              type="button"
              onClick={onCancel}
              className="flex-1 rounded bg-[#111827] border border-[#1e293b] text-[#94a3b8] py-2 text-sm hover:bg-[#1e293b] transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="flex-1 rounded bg-[#3b82f6] text-[#0a0f1e] py-2 text-sm font-semibold hover:bg-[#2563eb] transition-colors"
            >
              Add
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
