import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // 패스드림 PDF에서 뽑은 글자 줄을 서버 액션으로 보낸다 (학생 수십 명이면 1MB를 넘을 수 있음)
  experimental: { serverActions: { bodySizeLimit: '4mb' } },
};

export default nextConfig;
