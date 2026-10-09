// Products awaiting release: name, introduction and logo only. Add links once a product is publicly launched.
// Logos live in apps/web/public/media/products/; a product without one shows its initial.
export const PRODUCTS = [
  {
    slug: "twin",
    logo: "/media/products/twin.svg",
    name: "Twin",
    kind: { en: "Personal digital twin", zh: "个人数字分身" },
    description: {
      en: "A personal digital twin grounded in your own materials, with cited answers, voice and video. It acknowledges when the available information is insufficient.",
      zh: "从本人资料构建数字分身，支持带出处的回答、语音和视频；资料不足时明确说明。",
    },
  },
  {
    slug: "tachi",
    logo: "/media/products/tachi.png",
    name: "Tachi",
    kind: { en: "macOS developer tool", zh: "macOS 开发者工具" },
    description: {
      en: "A macOS menu bar companion for AI coding sessions, Claude usage and Codex quota. It reads local tool data to keep your workflow visible at a glance.",
      zh: "在 macOS 菜单栏查看 AI 编程会话、Claude 用量和 Codex 配额，通过本地工具数据了解工作状态。",
    },
  },
  {
    slug: "lancer",
    logo: "/media/products/lancer.svg",
    name: "Lancer",
    kind: { en: "Microservice development", zh: "微服务开发工具" },
    description: {
      en: "Debug a local JVM microservice against a shared Kubernetes environment with per-developer request routing. An alpha tool for Spring Cloud, Dubbo and Nacos workflows.",
      zh: "将开发者自己的请求路由到本地 JVM，在共享 Kubernetes 环境中调试微服务。面向 Spring Cloud、Dubbo 和 Nacos 工作流，目前处于 Alpha 阶段。",
    },
  },
  {
    slug: "skills",
    name: "Skills",
    kind: { en: "Open-source agent skills", zh: "开源 Agent 技能" },
    description: {
      en: "Reusable agent skills for creation, knowledge work and software engineering, with explicit boundaries and verifiable workflows.",
      zh: "面向创作、知识工作和软件工程的可复用 Agent 技能，明确执行边界，强调可验证的工作流程。",
    },
  },
  {
    slug: "robolabx",
    name: "RoboLabX",
    kind: { en: "AI education", zh: "AI 教育" },
    description: {
      en: "An AI-assisted K–12 education application with a dedicated learning workspace for teachers and students.",
      zh: "面向 K12 教育的 AI 应用，为教师与学生提供专门的学习工作空间。",
    },
  },
] as const;
