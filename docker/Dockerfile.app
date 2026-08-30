FROM rocketchat/rocket.chat:6.13.0

# Rocket.Chat Apps Engine requires the app to be installed
# at runtime via the Admin UI or API. This Dockerfile extends
# the official Rocket.Chat image for local development.

# The RAGChat App is deployed to Rocket.Chat via:
#   1. `rc-apps deploy --url http://localhost:3000 --username admin --password admin`
#   2. Or via the Admin UI → Apps → Upload App

# This image is for development/testing — for production,
# install the app through Rocket.Chat's marketplace or
# private app registry.

ENV OVERWRITE_SETTING_Show_Setup_Wizard=completed
ENV ROCKETCHAT_APP_URL=http://localhost:8000

# Pre-create directories for app persistence
RUN mkdir -p /app/data

EXPOSE 3000