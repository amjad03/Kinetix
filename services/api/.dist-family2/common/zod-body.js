import { BadRequestException } from '@nestjs/common';
import { z } from 'zod';
/** Validates a request body against a zod schema: `@Body(new ZodBody(Schema)) body: z.infer<typeof Schema>`. */
export class ZodBody {
    constructor(schema) {
        this.schema = schema;
    }
    transform(value) {
        const parsed = this.schema.safeParse(value);
        if (!parsed.success)
            throw new BadRequestException(z.flattenError(parsed.error));
        return parsed.data;
    }
}
//# sourceMappingURL=zod-body.js.map