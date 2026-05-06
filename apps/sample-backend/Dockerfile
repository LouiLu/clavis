FROM golang:1.23-alpine AS build
WORKDIR /src
COPY apps/sample-backend/go.mod apps/sample-backend/go.sum* ./
RUN go mod download
COPY apps/sample-backend ./
RUN go build -o /out/sample-backend .

FROM alpine:3.21
WORKDIR /app
COPY --from=build /out/sample-backend /app/sample-backend
EXPOSE 6060
CMD ["/app/sample-backend"]
