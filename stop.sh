#!/usr/bin/env bash
set -e

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo -e "${YELLOW}Stopping Ghost Game Server Platform...${NC}\n"

# Bring down all services
docker compose down

echo -e "\n${GREEN}====================================================${NC}"
echo -e "${GREEN}🛑 Ghost has been safely stopped.${NC}"
echo -e "${GREEN}====================================================${NC}"
echo -e "Your game servers and builder VMs in Hetzner are unaffected."
echo -e "To start the platform again, run: ${YELLOW}./start.sh${NC}"
