"use client";
import { useParams } from "next/navigation";
import Landing from "@/components/Landing";
export default function Page() { const { slug } = useParams<{ slug: string }>(); return <Landing slug={slug} />; }
