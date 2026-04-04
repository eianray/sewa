"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import ProjectDetailClient from "@/components/ProjectDetailClient";

function ProjectPage() {
  const searchParams = useSearchParams();
  const id = searchParams.get("id") || "";
  return <ProjectDetailClient projectId={id} />;
}

export default function ProjectDetailPage() {
  return (
    <Suspense fallback={<div className="w-screen h-screen bg-[#0a0f1e]" />}>
      <ProjectPage />
    </Suspense>
  );
}
