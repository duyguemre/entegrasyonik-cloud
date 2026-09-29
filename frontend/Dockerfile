# Use a Node.js base image
FROM nginx:alpine

# Copy the built Vue.js application files to Nginx's default public directory
COPY dist /usr/share/nginx/html

COPY ./nginx.conf /etc/nginx/conf.d/default.conf
# R7 / G-03: güvenlik başlıkları (nginx.conf her location'da include eder)
COPY ./nginx-security-headers.conf /etc/nginx/snippets/security-headers.conf

# Expose port 80
EXPOSE 80

# Command to run Nginx in the foreground
CMD ["nginx", "-g", "daemon off;"]


# npm run build
# docker build -t entegrator_frontend .
# docker run -d -p 3000:80 --name entegrator_frontend_container entegrator_frontend