"use client";
import { useParams } from "next/navigation";
import RegisterForm from "@/components/RegisterForm";
export default function Page() { const { slug } = useParams<{ slug: string }>(); return <RegisterForm kind="student" slug={slug} />; }
