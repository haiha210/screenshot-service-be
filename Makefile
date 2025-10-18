.PHONY: help install dev up down logs build clean query-screenshots

help: ## Hiển thị help
	@echo "Available commands:"
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | sort | awk 'BEGIN {FS = ":.*?## "}; {printf "\033[36m%-20s\033[0m %s\n", $$1, $$2}'

install: ## Cài đặt dependencies
	yarn install

dev: ## Chạy development mode với LocalStack
	docker-compose -f docker-compose.dev.yml up -d
	@echo "✅ Services started!"
	@echo "View logs: make logs-dev"

up: ## Chạy production mode
	docker-compose up -d
	@echo "✅ Service started!"
	@echo "View logs: make logs"

down: ## Dừng production services
	docker-compose down

down-dev: ## Dừng development services
	docker-compose -f docker-compose.dev.yml down

logs: ## Xem logs production
	docker-compose logs -f screenshot-service

logs-dev: ## Xem logs development
	docker-compose -f docker-compose.dev.yml logs -f screenshot-service-dev

build: ## Build Docker image
	docker build -t screenshot-service:latest .

build-dev: ## Build development Docker image
	docker build -f Dockerfile.dev -t screenshot-service:dev .

clean: ## Xóa containers và volumes
	docker-compose down -v
	docker-compose -f docker-compose.dev.yml down -v

restart: down up ## Restart production service

restart-dev: down-dev dev ## Restart development service

query-screenshots: ## Query screenshots (usage: make query-screenshots STATUS=success)
	@if [ -z "$(STATUS)" ]; then \
		yarn query-screenshots; \
	else \
		yarn query-screenshots $(STATUS); \
	fi

localstack-shell: ## Vào shell của LocalStack container
	docker-compose -f docker-compose.dev.yml exec localstack bash

localstack-logs: ## Xem logs của LocalStack
	docker-compose -f docker-compose.dev.yml logs -f localstack

check-queue: ## Kiểm tra SQS queue trong LocalStack
	docker-compose -f docker-compose.dev.yml exec localstack \
		awslocal sqs receive-message --queue-url http://localhost:4566/000000000000/screenshot-queue

check-s3: ## Kiểm tra S3 bucket trong LocalStack
	docker-compose -f docker-compose.dev.yml exec localstack \
		awslocal s3 ls s3://screenshot-bucket --recursive

check-dynamodb: ## Kiểm tra DynamoDB table trong LocalStack
	docker-compose -f docker-compose.dev.yml exec localstack \
		awslocal dynamodb scan --table-name screenshot-results

send-test-local: ## Gửi test message vào LocalStack
	docker-compose -f docker-compose.dev.yml exec localstack \
		awslocal sqs send-message \
		--queue-url http://localhost:4566/000000000000/screenshot-queue \
		--message-body '{"url":"https://example.com","width":1920,"height":1080}'

ps: ## Xem trạng thái containers
	docker-compose ps

ps-dev: ## Xem trạng thái development containers
	docker-compose -f docker-compose.dev.yml ps
