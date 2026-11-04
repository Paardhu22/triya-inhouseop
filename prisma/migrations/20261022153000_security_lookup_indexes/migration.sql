CREATE INDEX "Session_expires_idx" ON "Session"("expires");
CREATE INDEX "Tenant_propertyId_photoUrl_idx" ON "Tenant"("propertyId", "photoUrl");
CREATE INDEX "Document_storageKey_idx" ON "Document"("storageKey");
CREATE INDEX "Invoice_propertyId_storageKey_idx" ON "Invoice"("propertyId", "storageKey");
CREATE INDEX "Expense_propertyId_receiptKey_idx" ON "Expense"("propertyId", "receiptKey");
