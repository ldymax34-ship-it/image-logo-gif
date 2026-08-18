# ---------------------------------------------------------------------------
# 品宣物料工作台 - Web Lite（静态文件服务器）
#
# 说明：本镜像只负责分发构建后的静态资源（HTML / JS / CSS）。
# 图片处理、预览与导出都在访问者自己的浏览器里完成，
# 素材不会上传到服务器，也不在本镜像内进行任何图片/视频计算。
# ---------------------------------------------------------------------------
FROM node:22-alpine AS build

WORKDIR /app

# 先安装依赖，利用 Docker 层缓存加速重复构建。
COPY package.json package-lock.json ./
RUN npm ci

COPY . .
RUN npm run build

FROM nginx:1.27-alpine

COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 8080

CMD ["nginx", "-g", "daemon off;"]
