"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { getAccessToken } from "@/lib/auth";

/** 根路由：已登录→选题池，未登录→登录。 */
export default function Home() {
  const router = useRouter();
  useEffect(() => {
    router.replace(getAccessToken() ? "/topics" : "/login");
  }, [router]);
  return null;
}
