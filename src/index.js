export default {
    async fetch(request, env) {
        const url = new URL(request.url);

        if (request.method === "GET" && url.pathname === "/") {
            return new Response("hello from worker");
        }

        const authorization = request.headers.get("Authorization");

        if (authorization !== `Bearer ${env.API_TOKEN}`) {
            return Response.json(
                { error: "Unauthorized" },
                { status: 401 }
            );
        }

        if (request.method === "GET" && url.pathname === "/latest") {
            const storedImage = await env.IMAGES.head("latest-image");

            if (!storedImage) {
                return Response.json({
                    available: false,
                });
            }

            return Response.json({
                available: true,
                id: storedImage.customMetadata?.id,
                uploadedAt: storedImage.customMetadata?.uploadedAt,
            });
        }

        if (request.method === "GET" && url.pathname === "/image") {
            const storedImage = await env.IMAGES.get("latest-image");

            if (!storedImage) {
                return Response.json(
                    { error: "No image available" },
                    { status: 404 }
                );
            }

            return new Response(storedImage.body, {
                headers: {
                    "Content-Type":
                        storedImage.httpMetadata?.contentType ||
                        "application/octet-stream",
                },
            });
        }

        if (request.method === "POST" && url.pathname === "/upload") {
            const form = await request.formData();
            const image = form.get("image");

            if (!(image instanceof File)) {
                return Response.json(
                    { error: "No image uploaded" },
                    { status: 400 }
                );
            }

            const imageId = crypto.randomUUID();
            const uploadedAt = new Date().toISOString();

            await env.IMAGES.put("latest-image", image, {
                httpMetadata: {
                    contentType: image.type,
                },
                customMetadata: {
                    id: imageId,
                    uploadedAt,
                },
            });

            return Response.json({
                message: "File received",
                id: imageId,
                name: image.name,
                type: image.type,
                size: image.size,
            });
        }

        return new Response("not found", { status: 404 });
    },
};