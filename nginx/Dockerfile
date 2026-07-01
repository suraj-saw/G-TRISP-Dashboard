FROM nginx:alpine

# Remove default config
RUN rm /etc/nginx/conf.d/default.conf

# Copy our custom nginx config
COPY nginx/nginx.conf /etc/nginx/nginx.conf

# Copy frontend build output
COPY frontend/dist /usr/share/nginx/html
