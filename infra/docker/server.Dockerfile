FROM golang:1.22-alpine AS build
WORKDIR /src

RUN apk add --no-cache ca-certificates

COPY server/ ./
WORKDIR /src
# Build without network by forcing Go to use the vendored dependencies.
# TARGETARCH is provided by Docker BuildKit / buildx, which lets the same
# Dockerfile produce amd64 or arm64 images for different Kubernetes nodes.
ARG TARGETARCH
RUN CGO_ENABLED=0 GOOS=linux GOARCH=${TARGETARCH:-amd64} go build -mod=vendor -ldflags="-s -w" -o /out/homepage-api .

FROM gcr.io/distroless/static-debian12
WORKDIR /app

COPY --from=build /out/homepage-api /app/homepage-api

EXPOSE 8080
ENTRYPOINT ["/app/homepage-api"]
