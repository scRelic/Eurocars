import { getPublicCar } from "../../repositories/public-cars";
import { getDatabase } from "../../utils/db";
import { listingId } from "../../utils/listing-auth";

export default defineEventHandler(async (event) => {
  const id = listingId(getRouterParam(event, "id"));
  const car = await getPublicCar(getDatabase(event), id);
  if (!car) throw createError({ statusCode: 404, statusMessage: "Car not found." });
  setResponseHeader(event, "Cache-Control", "public, max-age=30");
  return { car };
});
