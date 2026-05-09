#!/usr/bin/env bash
set -e

# Define colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

echo -e "${GREEN}Starting Ghost Game Server Platform...${NC}\n"

# 1. Environment Setup
if [ ! -f .env ]; then
    echo -e "${YELLOW}No .env file found. Initializing from .env.example...${NC}"
    cp .env.example .env
    
    # Generate cryptographically secure 32-character hex secrets
    BETTER_AUTH_SECRET=$(openssl rand -hex 16)
    BOOTSTRAP_JWT_SECRET=$(openssl rand -hex 16)
    
    # Replace the placeholder strings with the secure secrets
    sed -i "s/changeme_in_production_min_32_chars!/$BETTER_AUTH_SECRET/g" .env
    sed -i "s/changeme_in_production_min_32_chars!/$BOOTSTRAP_JWT_SECRET/g" .env
    
    echo -e "${GREEN}Generated secure random secrets for BETTER_AUTH_SECRET and BOOTSTRAP_JWT_SECRET.${NC}"
    echo -e "${YELLOW}Note: Please review the .env file to configure APP_URL, GHOST_GIT_REPO_URL, and Hetzner settings for production use.${NC}\n"
else
    echo -e "${GREEN}.env file found.${NC}"
fi

# 2. Start Infrastructure Services
echo -e "${GREEN}Starting infrastructure (PostgreSQL & Redis)...${NC}"
docker compose up -d postgres redis

# 3. Wait for PostgreSQL to be healthy
echo -e "${YELLOW}Waiting for PostgreSQL to be ready...${NC}"
# We poll the healthcheck status instead of directly running pg_isready to ensure Docker considers it healthy
until [ "$(docker compose ps postgres -q | xargs -r docker inspect -f '{{.State.Health.Status}}')" == "healthy" ]; do
    echo -n "."
    sleep 2
done
echo -e "\n${GREEN}PostgreSQL is ready!${NC}\n"

# 4. Database Migrations
echo -e "${GREEN}Running database migrations...${NC}"
# We run this in a temporary container using the ghost image to ensure the schema matches the codebase
# Using bunx to fetch the prisma CLI dynamically as needed
docker compose run --rm --entrypoint="bunx prisma migrate deploy" ghost
echo -e "${GREEN}Database migrations complete.${NC}\n"

# 5. Start Application
echo -e "${GREEN}Building and starting the Ghost application...${NC}"
docker compose up -d --build ghost

echo -e "\n${GREEN}====================================================${NC}"
echo -e "${GREEN}🚀 Ghost is now running successfully!${NC}"
echo -e "${GREEN}====================================================${NC}"
echo -e "Application URL: ${YELLOW}http://localhost:3000${NC}"
echo -e "To view logs:    ${YELLOW}./start.sh logs${NC} or ${YELLOW}docker compose logs -f${NC}"
echo -e "To stop:         ${YELLOW}./stop.sh${NC}"
echo -e "===================================================="
