import { z } from "zod";
import { router, protectedProcedure } from "../_core/trpc";
import {
  savePayload,
  loadPayload,
  getAllPayloads,
  deletePayload,
  updatePayload,
  searchPayloads,
  getStorageStats,
  StoredPayload,
  initializeStorage,
} from "../_core/storage";
import { getTemplatesByType, getAllTemplates } from "../_core/payloadTemplates";
import { v4 as uuidv4 } from "uuid";

const PayloadTypeEnum = z.enum(["hid", "rfid", "wifi", "lan", "generic"]);
const PayloadSchema = z.object({
  name: z.string().min(1).max(255),
  type: PayloadTypeEnum,
  description: z.string().max(1000),
  content: z.record(z.any()),
  tags: z.array(z.string()).default([]),
  encrypt: z.boolean().default(false),
});

export const payloadRouter = router({
  // Create new payload
  create: protectedProcedure
    .input(PayloadSchema)
    .mutation(({ input }) => {
      initializeStorage();

      const payload: StoredPayload = {
        id: uuidv4(),
        name: input.name,
        type: input.type,
        description: input.description,
        content: input.content,
        tags: input.tags,
        encrypted: input.encrypt,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      try {
        savePayload(payload, input.encrypt);

        return {
          success: true,
          payload,
          message: `Payload "${payload.name}" created successfully`,
        };
      } catch (error) {
        throw new Error(`Failed to create payload: ${error}`);
      }
    }),

  // Get payload by ID
  getById: protectedProcedure
    .input(
      z.object({
        id: z.string(),
        type: z.enum(["hid", "rfid", "wifi", "lan", "generic"]),
      })
    )
    .query(({ input }) => {
      const payload = loadPayload(input.id, input.type);

      if (!payload) {
        throw new Error("Payload not found");
      }

      return payload;
    }),

  // Get all payloads (optional filter by type)
  list: protectedProcedure
    .input(
      z.object({
        type: z.enum(["hid", "rfid", "wifi", "lan", "generic"]).optional(),
        limit: z.number().default(100),
        offset: z.number().default(0),
      })
    )
    .query(({ input }) => {
      const payloads = getAllPayloads(input.type);
      const total = payloads.length;

      return {
        data: payloads.slice(input.offset, input.offset + input.limit),
        total,
        limit: input.limit,
        offset: input.offset,
      };
    }),

  // Update existing payload
  update: protectedProcedure
    .input(
      z.object({
        id: z.string(),
        type: z.enum(["hid", "rfid", "wifi", "lan", "generic"]),
        updates: PayloadSchema.partial(),
      })
    )
    .mutation(({ input }) => {
      const success = updatePayload(input.id, input.type, input.updates, input.updates.encrypt ?? false);

      if (!success) {
        throw new Error("Payload not found or update failed");
      }

      const updated = loadPayload(input.id, input.type);

      return {
        success: true,
        payload: updated,
        message: "Payload updated successfully",
      };
    }),

  // Delete payload
  delete: protectedProcedure
    .input(
      z.object({
        id: z.string(),
        type: z.enum(["hid", "rfid", "wifi", "lan", "generic"]),
      })
    )
    .mutation(({ input }) => {
      const success = deletePayload(input.id, input.type);

      if (!success) {
        throw new Error("Payload not found");
      }

      return {
        success: true,
        message: "Payload deleted successfully",
      };
    }),

  // Search payloads
  search: protectedProcedure
    .input(
      z.object({
        query: z.string().min(1),
        type: z.enum(["hid", "rfid", "wifi", "lan", "generic"]).optional(),
      })
    )
    .query(({ input }) => {
      return searchPayloads(input.query, input.type);
    }),

  // Get all templates
  getTemplates: protectedProcedure.query(() => {
    return getAllTemplates();
  }),

  // Get templates for specific type
  getTemplatesByType: protectedProcedure
    .input(z.object({ type: z.enum(["hid", "rfid", "wifi", "lan", "generic"]) }))
    .query(({ input }) => {
      return getTemplatesByType(input.type);
    }),

  // Create from template
  createFromTemplate: protectedProcedure
    .input(
      z.object({
        type: z.enum(["hid", "rfid", "wifi", "lan", "generic"]),
        templateId: z.string(),
        customName: z.string().optional(),
        customDescription: z.string().optional(),
      })
    )
    .mutation(({ input }) => {
      const templates = getTemplatesByType(input.type);
      const template = templates[input.templateId as keyof typeof templates];

      if (!template) {
        throw new Error("Template not found");
      }

      const payload: StoredPayload = {
        id: uuidv4(),
        name: input.customName || template.name,
        type: input.type,
        description: input.customDescription || template.description,
        content: template.content,
        tags: ["from-template"],
        encrypted: false,
        metadata: template.metadata,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      try {
        savePayload(payload, false);

        return {
          success: true,
          payload,
          message: `Payload created from template "${template.name}"`,
        };
      } catch (error) {
        throw new Error(`Failed to create payload from template: ${error}`);
      }
    }),

  // Get storage statistics
  stats: protectedProcedure.query(() => {
    return getStorageStats();
  }),

  // Export payloads as JSON
  export: protectedProcedure
    .input(
      z.object({
        type: z.enum(["hid", "rfid", "wifi", "lan", "generic"]).optional(),
      })
    )
    .query(({ input }) => {
      const payloads = getAllPayloads(input.type);

      return {
        timestamp: new Date().toISOString(),
        type: input.type || "all",
        count: payloads.length,
        payloads,
      };
    }),

  // Import payloads from JSON
  import: protectedProcedure
    .input(
      z.object({
        payloads: z.array(
          z.object({
            name: z.string(),
            type: z.enum(["hid", "rfid", "wifi", "lan", "generic"]),
            description: z.string(),
            content: z.record(z.any()),
            tags: z.array(z.string()).optional(),
            encrypt: z.boolean().optional(),
          })
        ),
      })
    )
    .mutation(({ input }) => {
      const imported: StoredPayload[] = [];
      const errors: string[] = [];

      input.payloads.forEach((p, index) => {
        try {
          const payload: StoredPayload = {
            id: uuidv4(),
            name: p.name,
            type: p.type,
            description: p.description,
            content: p.content,
            tags: p.tags || [],
            encrypted: p.encrypt || false,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          };

          savePayload(payload, p.encrypt || false);
          imported.push(payload);
        } catch (error) {
          errors.push(`Payload ${index + 1}: ${error}`);
        }
      });

      return {
        success: errors.length === 0,
        imported: imported.length,
        failed: errors.length,
        errors,
        message: `Imported ${imported.length} payloads successfully`,
      };
    }),

  // Duplicate payload
  duplicate: protectedProcedure
    .input(
      z.object({
        id: z.string(),
        type: z.enum(["hid", "rfid", "wifi", "lan", "generic"]),
        newName: z.string().optional(),
      })
    )
    .mutation(({ input }) => {
      const original = loadPayload(input.id, input.type);

      if (!original) {
        throw new Error("Original payload not found");
      }

      const duplicated: StoredPayload = {
        ...original,
        id: uuidv4(),
        name: input.newName || `${original.name} (copy)`,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      savePayload(duplicated, original.encrypted);

      return {
        success: true,
        payload: duplicated,
        message: "Payload duplicated successfully",
      };
    }),
});
