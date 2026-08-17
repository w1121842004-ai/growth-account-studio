/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // MVP：单仓单体全栈（Spec ADR-001）。Route Handlers 提供 /api/v1/*。
  // 不启用任何需要固定出口 IP 的平台 API（微信/头条发布均人工粘贴，ADR-003）。
};

export default nextConfig;
