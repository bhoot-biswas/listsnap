import "server-only";

/** The GraphQL Admin API calls ListSnap makes, in one place. */

const PRODUCT_FIELDS = `
  id
  status
  options { name optionValues { name } }
  variants(first: 250) {
    nodes { id price selectedOptions { name value } itemId: metafield(namespace: "listsnap", key: "item_id") { value } }
  }
  media(first: 250) { nodes { id } }
  listingId: metafield(namespace: "listsnap", key: "listing_id") { value }
  mediaMap: metafield(namespace: "listsnap", key: "media") { value }
`;

export const PRODUCT = `query Product($id: ID!) { product(id: $id) { ${PRODUCT_FIELDS} } }`;

export const FIND_PRODUCTS = `query FindProducts($q: String!) { products(first: 10, query: $q) { nodes { ${PRODUCT_FIELDS} } } }`;

export const PRODUCT_SET = `mutation ProductSet($input: ProductSetInput!, $identifier: ProductSetIdentifiers) {
  productSet(input: $input, identifier: $identifier, synchronous: true) {
    product { id media(first: 250) { nodes { id } } }
    userErrors { field message code }
  }
}`;

export const METAFIELDS_SET = `mutation MetafieldsSet($metafields: [MetafieldsSetInput!]!) {
  metafieldsSet(metafields: $metafields) { userErrors { field message code } }
}`;

export const CHECK = `query Check {
  shop { name currencyCode }
  locations(first: 50) { nodes { id name isActive } }
  currentAppInstallation { accessScopes { handle } }
}`;

export interface RawProduct {
  id: string;
  status: string;
  options: { name: string; optionValues: { name: string }[] }[];
  variants: {
    nodes: {
      id: string;
      price: string;
      selectedOptions: { name: string; value: string }[];
      itemId: { value: string } | null;
    }[];
  };
  media: { nodes: { id: string }[] };
  listingId: { value: string } | null;
  mediaMap: { value: string } | null;
}

export interface UserErrors {
  userErrors: { field?: string[] | null; message: string; code?: string | null }[];
}
