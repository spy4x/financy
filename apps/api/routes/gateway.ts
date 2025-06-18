// import { Hono } from "hono";

// import {
//   gatewayBaseSchema,
//   gatewayUpdateSchema,
//   SyncModelName,
//   UserRole,
//   WebSocketMessageType,
// } from "@shared/types";
// import { db, websockets } from "@api/services";
// import { isRole } from "@api/middlewares";

// import { APIContext } from "../_types.ts";

// export const gatewayRoute = new Hono<APIContext>()
//   .get(`/`, async (c) => {
//     return c.json({ data: await db.gateway.findMany() });
//   })
//   // ------------ Management routes ------------
//   .use(isRole(UserRole.ADMIN, UserRole.SUPERVISOR))
//   .post(`/`, async (c) => {
//     const parseResult = gatewayBaseSchema.safeParse(await c.req.json());
//     if (!parseResult.success) {
//       return c.json(parseResult.error, 400);
//     }
//     const gateway = await db.gateway.createOne({ data: parseResult.data });
//     websockets.onModelChange(
//       SyncModelName.gateway,
//       [gateway],
//       WebSocketMessageType.CREATED,
//     );
//     return c.json(gateway);
//   })
//   .patch(`/:id`, async (c) => {
//     const parseResult = gatewayUpdateSchema.safeParse(await c.req.json());
//     if (!parseResult.success) {
//       return c.json(parseResult.error, 400);
//     }
//     const id = Number(c.req.param("id"));
//     const update = parseResult.data;

//     const existingGateway = await db.gateway.findOne({ id });
//     if (!existingGateway) {
//       return c.json({ message: "Gateway not found" }, 404);
//     }

//     if (!existingGateway.deletedAt && update.deletedAt) {
//       update.deletedAt = new Date(); // set deletedAt to now on server side
//       const dependencies = await Promise.all([
//         db.zone.findByGateway(id),
//         db.sensor.findByGateway(id),
//         db.lampBox.findByGateway(id),
//       ]);
//       if (dependencies.find((dependency) => dependency.length > 0)) {
//         return c.json({ message: "Dependants are not deleted" }, 400);
//       }
//     } else if (existingGateway.deletedAt && update.deletedAt) {
//       update.deletedAt = existingGateway.deletedAt; // keep deletedAt as it was
//     }

//     const updatedGateway = await db.gateway.updateOne({
//       id,
//       data: update,
//     });
//     websockets.onModelChange(
//       SyncModelName.gateway,
//       [updatedGateway],
//       WebSocketMessageType.UPDATED,
//     );
//     return c.json(updatedGateway);
//   });
