
default: (web)

set dotenv-load := true
set dotenv-path := "./infra/envs/.env"

compose params:
    docker compose -f "./infra/compose/compose.shared.yml" -f "./infra/compose/compose.${ENV}.yml" --env-file="./infra/envs/.env" {{params}}

start: web

web:
    just compose "up -d --build --force-recreate proxy db redis minio minio-configure api web"

dev:
    just compose "up -d --build --remove-orphans"

dev_down:
    just compose "down --remove-orphans"

dev_stop: dev_down

dev_restart:
    just dev_stop
    just dev

delete_volumes:
    sudo rm -rf .volumes

dev_pristine:
    just dev_stop
    just delete_volumes
    just dev

prod:
    just compose "build"
    # restart api to apply migrations
    just compose "restart api"
    just compose "up -d"
    just fresh_deploy_workaround

prod_deploy:
    just prepare_release
    # TODO: we should not restart mosquitto and db on every deploy
    just prod_deploy_prepare
    just prod_deploy_copy
    just prod_deploy_run

prod_deploy_prepare:
    ssh gb-prod 'mkdir -p app && cd app && just mqtt_fix_ownership'

prod_deploy_copy:
    rsync -avhzru -e 'ssh' . gb-prod:~/app --exclude-from='infra/deploy/exclude.txt' --include-from='infra/deploy/include.txt' --include-from='infra/deploy/include.prod.txt'  --exclude '*'
    ssh gb-prod 'cd app && mv ./infra/envs/.env.prod ./infra/envs/.env'

prod_deploy_run:
    ssh gb-prod 'cd app && just prod'



