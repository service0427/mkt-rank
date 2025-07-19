#!/bin/bash

# Fix unused parameter warnings by prefixing with underscore
echo "Fixing TypeScript errors..."

# Fix controller files
sed -i '' 's/data: any/_data: any/g' src/controllers/*.ts
sed -i '' 's/keywordId: string/_keywordId: string/g' src/controllers/*.ts
sed -i '' 's/serviceId: string/_serviceId: string/g' src/controllers/*.ts

# Fix route files
sed -i '' 's/(req: Request/(\_req: Request/g' src/web/routes/*.ts
sed -i '' 's/, req: /, \_req: /g' src/web/routes/*.ts

# Fix return statement in services.routes.ts
sed -i '' '/return res.status(404)/a\
    }' src/web/routes/services.routes.ts

# Remove unused import
sed -i '' '/, SyncLog/d' src/sync/worker.ts

echo "TypeScript errors fixed!"