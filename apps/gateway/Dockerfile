FROM golang:1.23-alpine AS build
WORKDIR /src
COPY apps/gateway/go.mod apps/gateway/go.sum* ./
RUN go mod download
COPY apps/gateway ./
RUN go build -o /out/gateway ./cmd/gateway

FROM alpine:3.21
WORKDIR /app
COPY --from=build /out/gateway /app/gateway
EXPOSE 8080
CMD ["/app/gateway"]
