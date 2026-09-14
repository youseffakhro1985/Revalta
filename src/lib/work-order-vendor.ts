import type { Prisma, PrismaClient } from "@prisma/client";

type VendorClient = Pick<PrismaClient, "vendorContract">;

export const vendorContractOptionSelect = {
  id: true,
  name: true,
  category: true,
  property_id: true,
  status: true,
} as const;

export type VendorContractOption = Prisma.VendorContractGetPayload<{
  select: typeof vendorContractOptionSelect;
}>;

export function findAssignableVendorContract(
  client: VendorClient,
  input: { companyId: string; vendorContractId: string; propertyId: string },
) {
  return client.vendorContract.findFirst({
    where: {
      id: input.vendorContractId,
      company_id: input.companyId,
      status: "active",
      OR: [{ property_id: null }, { property_id: input.propertyId }],
    },
    select: { id: true, name: true, category: true },
  });
}

export function listAssignableVendorContracts(client: VendorClient, companyId: string) {
  return client.vendorContract.findMany({
    where: {
      company_id: companyId,
      status: "active",
      OR: [{ property_id: null }, { property: { deleted_at: null } }],
    },
    orderBy: [{ name: "asc" }, { created_at: "desc" }],
    take: 200,
    select: vendorContractOptionSelect,
  });
}

export function vendorsForProperty(vendors: VendorContractOption[], propertyId: string | null) {
  if (!propertyId) return vendors.filter((vendor) => !vendor.property_id);
  return vendors.filter((vendor) => !vendor.property_id || vendor.property_id === propertyId);
}
