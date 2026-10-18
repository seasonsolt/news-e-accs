import { defineModule } from "@aihot/contracts/modules";
export default defineModule({
  name: "wallpaper",
  pages: [
    { path: "products/wallpaper", file: "web/page.tsx", id: "wallpaper" },
    { path: "zh/products/wallpaper", file: "web/page.tsx", id: "zh-wallpaper" },
  ],
  adminPages: [{ path: "admin/wallpapers", file: "web/admin.tsx", id: "admin-wallpapers" }],
  apiPaths: [/^\/products\/wallpaper\/(?:preview\/|today\/|\d{4}-\d{2}-\d{2}\/)/, /^\/api\/site\/wallpapers?(?:\/|$)/, /^\/api\/admin\/wallpapers(?:\/|$)/],
  localizedPaths: [/^\/products\/wallpaper$/],
});
