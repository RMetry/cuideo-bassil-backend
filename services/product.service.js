const Brand = require("../model/Brand");
const Category = require("../model/Category");
const Product = require("../model/Products");

// Create product service
exports.createProductService = async (data) => {
  try {
    const product = await Product.create(data);
    const { _id: productId, brand, category } = product;

    // Update Brand and Category using batch updates
    await Promise.all([
      Brand.updateOne({ _id: brand.id }, { $push: { products: productId } }),
      Category.updateOne(
        { _id: category.id },
        { $push: { products: productId } }
      ),
    ]);

    return product;
  } catch (error) {
    console.error("Error creating product:", error);
    throw error;
  }
};

// Create all product service
exports.addAllProductService = async (data) => {
  try {
    await Product.deleteMany();
    const products = await Product.insertMany(data);

    // Create batch updates for Brand and Category
    const brandUpdates = [];
    const categoryUpdates = [];

    products.forEach((product) => {
      brandUpdates.push({
        updateOne: {
          filter: { _id: product.brand.id },
          update: { $push: { products: product._id } },
        },
      });
      categoryUpdates.push({
        updateOne: {
          filter: { _id: product.category.id },
          update: { $push: { products: product._id } },
        },
      });
    });

    await Promise.all([
      Brand.bulkWrite(brandUpdates),
      Category.bulkWrite(categoryUpdates),
    ]);

    return products;
  } catch (error) {
    console.error("Error adding all products:", error);
    throw error;
  }
};

// Get all products
exports.getAllProductsService = async () => {
  return await Product.find({ status: "in-stock" }).populate("reviews");
};

// Get products by type with filtering
exports.getProductTypeService = async (req) => {
  const { type } = req.params;
  const query = req.query;
  let filter = { productType: type, status: "in-stock" };

  if (query.new === "true") {
    return Product.find(filter)
      .sort({ createdAt: -1 })
      .limit(8)
      .populate("reviews");
  } else if (query.featured === "true") {
    filter.featured = true;
  } else if (query.topSellers === "true") {
    return Product.find(filter)
      .sort({ sellCount: -1 })
      .limit(8)
      .populate("reviews");
  }

  return Product.find(filter).populate("reviews");
};

// Get products by types with pagination
exports.getAllProductsWithTypesService = async (req) => {
  const { type } = req.params;
  // let types = req.params.type ? req.params.type.split(",") : [];
  const skip = parseInt(req.params.skip, 10) || 0;
  const take = parseInt(req.params.take, 10) || 10;

  const types = Array.isArray(type) ? type : [];
  const query = types.includes("All")
    ? { status: "in-stock" }
    : { productType: { name: { $in: types } }, status: "in-stock" };

  return Product.find(query)
    .sort({ createdAt: -1 })
    .skip(skip >= 0 ? skip : 0)
    .limit(take >= 0 ? take : 10)
    .populate("reviews");
};

// Get products with dynamic filtering
exports.getProductsWithDynamicFilterService = async (req) => {
  const { skip, take, ...filters } = req.query;
  filters.status = "in-stock";
  return Product.find(filters)
    .sort({ createdAt: -1 })
    .skip(parseInt(skip, 10) || 0)
    .limit(parseInt(take, 10) || 10)
    .populate("reviews");
};

// Get offer timer product
exports.getOfferTimerProductService = async (query) => {
  return Product.find({
    productType: query,
    status: "in-stock",
    "offerDate.endDate": { $gt: new Date() },
  }).populate("reviews");
};

// Get popular products by type
exports.getPopularProductServiceByType = async (type) => {
  return Product.find({ productType: type, status: "in-stock" })
    .sort({ "reviews.length": -1 })
    .limit(8)
    .populate("reviews");
};

// Get top-rated products
exports.getTopRatedProductService = async () => {
  const products = await Product.find({
    reviews: { $exists: true, $ne: [] },
    status: "in-stock",
  }).populate("reviews");

  const topRatedProducts = products.map((product) => {
    const totalRating = product.reviews.reduce(
      (sum, review) => sum + review.rating,
      0
    );
    const averageRating = totalRating / product.reviews.length;

    return {
      ...product.toObject(),
      rating: averageRating,
    };
  });

  topRatedProducts.sort((a, b) => b.rating - a.rating);

  return topRatedProducts;
};

// Get product by ID
exports.getProductService = async (id) => {
  return Product.findOne({ _id: id }).populate("reviews");
};

// Get related products
exports.getRelatedProductService = async (productId) => {
  const currentProduct = await Product.findById(productId);
  return Product.find({
    "category.name": currentProduct.category.name,
    status: "in-stock",
    _id: { $ne: productId },
  });
};

// Update a product
exports.updateProductService = async (id, currProduct) => {
  try {
    const product = await Product.findById(id).populate("category"); // Populate the category

    if (!product) {
      throw new Error("Product not found");
    }

    const oldCategory = product.category; // Store the old category
    Object.assign(product, currProduct);

    if (currProduct.brand) {
      product.brand = {
        id: currProduct.brand.id,
        name: currProduct.brand.name,
      };
    }

    if (currProduct.category) {
      product.category = {
        id: currProduct.category.id,
        name: currProduct.category.name,
      };
    }
    // Save the updated product *before* updating categories
    await product.save();

    // Handle category updates if the category has changed
    if (
      oldCategory &&
      currProduct.category &&
      oldCategory.id !== currProduct.category.id
    ) {
      const newCategory = await Category.findById(currProduct.category.id);
      if (!newCategory) {
        throw new Error("New Category not found");
      }

      // Remove product ID from the old category's products array
      await Category.updateOne(
        { _id: oldCategory._id },
        { $pull: { products: id } }
      );

      // Add product ID to the new category's products array, only if it doesn't already exist
      await Category.updateOne(
        { _id: newCategory._id },
        { $addToSet: { products: id } } // Use $addToSet to prevent duplicates
      );
    }

    return product; // Return the updated product
  } catch (error) {
    console.error("Error updating product:", error);
    throw error;
  }
};
// exports.updateProductService = async (id, currProduct) => {
//   const product = await Product.findById(id);
//   if (!product) throw new Error("Product not found");

//   Object.assign(product, currProduct);

//   if (currProduct.brand) {
//     product.brand = { id: currProduct.brand.id, name: currProduct.brand.name };
//   }
//   if (currProduct.category) {
//     product.category = {
//       id: currProduct.category.id,
//       name: currProduct.category.name,
//     };
//   }

//   return await product.save();
// };

// Get reviewed products
exports.getReviewsProducts = async () => {
  const products = await Product.find({
    reviews: { $exists: true },
    status: "in-stock",
  }).populate("reviews");
  // Filter out products where reviews array is empty
  const filteredProducts = products.filter(
    (product) => product.reviews.length > 0
  );

  return filteredProducts;
};

// exports.getReviewsProducts = async () => {
//   return Product.find({
//     reviews: { $exists: true, $ne: [] },
//     status: "in-stock",
//   }).populate("reviews");
// };

// Get out-of-stock products
exports.getStockOutProducts = async () => {
  return Product.find({ status: "out-of-stock" }).sort({ createdAt: -1 });
};

// Delete a product
exports.deleteProduct = async (id) => {
  return Product.findByIdAndDelete(id);
};
exports.syncProductIdsWithCategoriesService = async () => {
  try {
    // Fetch all categories without populating (we only need product IDs here)
    const categories = await Category.find({}, { products: 1, parent: 1 });

    // Fetch product IDs grouped by category in a single query
    const productsByCategory = await Product.aggregate([
      {
        $group: {
          _id: "$category.id", // group by category ID
          productIds: { $addToSet: "$_id" }, // collect product IDs
        },
      },
    ]);

    // Convert aggregation result to a map
    const categoryToProducts = new Map();
    for (const entry of productsByCategory) {
      categoryToProducts.set(entry._id?.toString(), entry.productIds);
    }

    // Process each category
    for (const category of categories) {
      const currentProductIds = new Set(
        category.products.map((id) => id.toString())
      );
      const validProductIds = new Set();
      const productsToRemove = [];
      const productsToAdd = [];

      // Keep only valid products (exist in DB)
      for (const productId of currentProductIds) {
        if (await Product.exists({ _id: productId })) {
          validProductIds.add(productId);
        } else {
          productsToRemove.push(productId);
        }
      }

      // Add missing products for this category
      const expectedProducts =
        categoryToProducts.get(category._id.toString()) || [];
      for (const productId of expectedProducts) {
        if (!validProductIds.has(productId.toString())) {
          validProductIds.add(productId.toString());
          productsToAdd.push(productId);
        }
      }

      // Update only if something changed
      const finalProductIds = Array.from(validProductIds);
      if (
        productsToAdd.length > 0 ||
        productsToRemove.length > 0 ||
        finalProductIds.length !== category.products.length
      ) {
        await Category.updateOne(
          { _id: category._id },
          { $set: { products: finalProductIds } }
        );
      }

      // Logging
      if (productsToAdd.length > 0 && productsToRemove.length > 0) {
        console.log(
          `Category ${category.parent} updated. Added: ${productsToAdd.length}, removed: ${productsToRemove.length}, total: ${finalProductIds.length}`
        );
      } else if (productsToAdd.length > 0) {
        console.log(
          `Category ${category.parent} updated. Added: ${productsToAdd.length}, total: ${finalProductIds.length}`
        );
      } else if (productsToRemove.length > 0) {
        console.log(
          `Category ${category.parent} updated. Removed: ${productsToRemove.length}, total: ${finalProductIds.length}`
        );
      }
    }

    console.log("✅ Product IDs in all categories synchronized.");
  } catch (error) {
    console.error("❌ Error synchronizing product IDs with categories:", error);
    throw error;
  }
};

// exports.syncProductIdsWithCategoriesService = async () => {
//   try {
//     // 1. Fetch all categories and their products
//     const categories = await Category.find().populate("products");
//     const allProductIds = await Product.find().distinct("_id"); // Get all product IDs

//     for (const category of categories) {
//       const validProductIds = new Set();
//       const productsToAdd = [];
//       const productsToRemove = [];

//       // 2. Check each product ID in the category
//       for (const product of category.products) {
//         if (allProductIds.some((id) => id.equals(product._id))) {
//           validProductIds.add(product._id.toString());
//         } else {
//           productsToRemove.push(product._id);
//         }
//       }

//       // 3. Identify products that *should* be in this category but aren't
//       const categoryProducts = await Product.find({
//         "category.id": category._id,
//       });
//       for (const product of categoryProducts) {
//         if (!validProductIds.has(product._id.toString())) {
//           productsToAdd.push(product._id);
//           validProductIds.add(product._id.toString()); // Add to the set to avoid duplicates in the update
//         }
//       }

//       // 4. Update the category's products array
//       const finalProductIds = Array.from(validProductIds);
//       await Category.updateOne(
//         { _id: category._id },
//         { $set: { products: finalProductIds } }
//       );
//       if (productsToAdd.length > 0 && productsToRemove.length > 0) {
//         console.log(
//           `Category ${category.parent} updated.  Products added: ${productsToAdd.length}, products removed: ${productsToRemove.length}, total products: ${finalProductIds.length}`
//         );
//       } else if (productsToAdd.length > 0) {
//         console.log(
//           `Category ${category.parent} updated.  Products added: ${productsToAdd.length}, total products: ${finalProductIds.length}`
//         );
//       } else if (productsToRemove.length > 0) {
//         console.log(
//           `Category ${category.parent} updated.  Products removed: ${productsToRemove.length}, total products: ${finalProductIds.length}`
//         );
//       } else {
//         console.log(
//           `Category ${category.parent} checked.  No changes needed, total products: ${finalProductIds.length}`
//         );
//       }
//     }
//     console.log("Product IDs in all categories synchronized.");
//   } catch (error) {
//     console.error("Error synchronizing product IDs with categories:", error);
//     throw error; // Re-throw the error to be handled by the caller
//   }
// };

exports.clearExpiredDiscountsService = async () => {
  try {
    const expiredProducts = await Product.find({
      discount: { $gt: 0 },
      status: "in-stock",
      "offerDate.endDate": { $lt: new Date() },
    });

    if (expiredProducts.length === 0) {
      console.log("No products with expired discounts.");
      return;
    }

    const updatedProducts = await Product.updateMany(
      { _id: { $in: expiredProducts.map((p) => p._id) } },
      {
        $set: { discount: 0 },
        $unset: { "offerDate.endDate": "" },
      }
    );

    console.log(`products' discounts cleared.`);
  } catch (error) {
    console.error("Error clearing expired discounts:", error);
  }
};

module.exports.updateQuantitiesService = async (updates) => {
  if (!Array.isArray(updates)) {
    throw new Error("Updates should be an array.");
  }

  if (updates.length === 0) {
    console.warn("No updates provided.");
    return;
  }

  // Deduplicate by SKU (last update wins if multiple updates in the same batch)
  const latestUpdates = updates.reduce((map, update) => {
    if (update.sku && typeof update.quantity === "number") {
      map.set(update.sku, update);
    }
    return map;
  }, new Map());

  const bulkOperations = Array.from(latestUpdates.values()).map((update) => ({
    updateOne: {
      filter: { sku: update.sku },
      update: {
        $set: {
          quantity: update.quantity,
          status: update.quantity > 0 ? "in-stock" : "out-of-stock",
        },
      },
      upsert: false, // don’t create new products accidentally
    },
  }));

  if (bulkOperations.length === 0) {
    console.warn("No valid updates found.");
    return;
  }

  // Break into smaller chunks to avoid Mongo write lock issues
  const chunkSize = 200; // tweak based on DB performance
  let totalProcessed = 0;
  let totalFailed = 0;
  const failedSkus = [];

  for (let i = 0; i < bulkOperations.length; i += chunkSize) {
    const chunk = bulkOperations.slice(i, i + chunkSize);

    try {
      const result = await Product.bulkWrite(chunk, { ordered: false });

      const successCount = result.nModified || result.modifiedCount || 0;
      const matchedCount = result.nMatched || result.matchedCount || 0;
      const upsertedCount = result.upsertedCount || 0;

      totalProcessed += successCount;

      console.log(
        `✅ Chunk ${
          i / chunkSize + 1
        }: matched ${matchedCount}, updated ${successCount}, upserted ${upsertedCount}`
      );
    } catch (err) {
      totalFailed += chunk.length;
      const skus = chunk.map((op) => op.updateOne.filter.sku);
      failedSkus.push(...skus);

      console.error(
        `❌ Chunk ${i / chunkSize + 1} failed. ${
          chunk.length
        } updates skipped. SKUs: ${skus.join(", ")}`
      );
    }
  }

  console.log(`Processed ${bulkOperations.length} updates total.`);
  if (totalFailed > 0) {
    console.warn(
      `⚠️ ${totalFailed} updates failed. Affected SKUs: ${failedSkus.join(
        ", "
      )}`
    );
  }
};

// module.exports.updateQuantitiesService = async (updates) => {
//   if (!Array.isArray(updates)) {
//     throw new Error("Updates should be an array.");
//   }
//   for (const update of updates) {
//     console.log(`${update.sku}`);
//     if (update.sku == "MSF24") {
//       console.log(`SKU: ${update.sku}, Quantity: ${update.quantity}`);
//     }
//     if (update.sku == "AC13INV/G") {
//       console.log(`SKU: ${update.sku}, Quantity: ${update.quantity}`);
//     }
//   }
//   console.log("number of updates", updates.length);

//   if (updates.length === 0) {
//     console.warn("No updates provided.");
//     return;
//   }

//   const bulkOperations = updates
//     .filter((update) => update.sku && typeof update.quantity === "number")
//     .map((update) => ({
//       updateOne: {
//         filter: { sku: update.sku },
//         update: {
//           $set: {
//             quantity: update.quantity,
//             status: update.quantity > 0 ? "in-stock" : "out-of-stock",
//           },
//         },
//       },
//     }));

//   if (bulkOperations.length === 0) {
//     console.warn("No valid updates found.");
//     return;
//   }

//   await Product.bulkWrite(bulkOperations);
// };
exports.getFilteredPaginatedProductsService = async (query) => {
  try {
    const {
      skip = 0,
      take = 10,
      brand,
      category,
      productType,
      color,
      search,
      status,
      sortBy,
    } = query;

    const filter = {};
    const sortOptions = {};

    // Individual filters
    if (brand) {
      filter["brand.name"] = new RegExp(`^${brand}$`, "i");
    }
    if (category) {
      filter["category.name"] = new RegExp(`^${category}$`, "i");
    }
    if (productType) {
      filter["productType.name"] = new RegExp(`^${productType}$`, "i");
    }
    if (color) {
      filter["color.name"] = new RegExp(`^${color}$`, "i");
    }
    if (status) {
      filter["status"] = status;
    }

    // Global search across multiple text fields (excluding price and discount)
    if (search) {
      filter.$or = [
        { title: { $regex: new RegExp(search, "i") } },
        { "brand.name": { $regex: new RegExp(search, "i") } },
        { "category.name": { $regex: new RegExp(search, "i") } },
        { "color.name": { $regex: new RegExp(search, "i") } },
        { "color.code": { $regex: new RegExp(search, "i") } },
        { "productType.name": { $regex: new RegExp(search, "i") } },
        { description: { $regex: new RegExp(search, "i") } },
        { additionalInformation: { $regex: new RegExp(search, "i") } },
        { tags: { $regex: new RegExp(search, "i") } },
        { sku: { $regex: new RegExp(search, "i") } },
        { unit: { $regex: new RegExp(search, "i") } },
      ];
    }

    // Determine the sorting options
    if (category) {
      // If category is selected, sort by brand name ascending
      sortOptions["brand.name"] = 1;
    } else if (sortBy) {
      switch (sortBy.toUpperCase()) {
        case "LTH":
          sortOptions.price = 1;
          break;
        case "HTL":
          sortOptions.price = -1;
          break;
        default:
          sortOptions.createdAt = -1;
      }
    } else {
      sortOptions.createdAt = -1;
    }

    // Fetch the products with pagination and sorting
    const products = await Product.find(filter)
      .sort(sortOptions)
      .skip(parseInt(skip, 10))
      .limit(parseInt(take, 10))
      .populate("reviews");

    // Count the total number of products matching filters
    const totalCount = await Product.countDocuments(filter);

    return {
      products,
      totalCount,
    };
  } catch (error) {
    console.error("Error in getFilteredPaginatedProductsService:", error);
    throw new Error("Failed to retrieve products.");
  }
};

//test
// exports.getFilteredPaginatedProductsService = async (query) => {
//   try {
//     // Parse pagination params safely
//     const skip = Math.max(parseInt(query.skip, 10) || 0, 0);
//     const take = Math.min(parseInt(query.take, 10) || 10, 100); // cap page size

//     const { brand, category, productType, color, search, status, sortBy } =
//       query;

//     const filter = {};
//     const sortOptions = {};

//     // -------------------------
//     // 1️⃣ Apply filters
//     // -------------------------
//     if (brand) filter["brand.name"] = new RegExp(`^${brand}$`, "i");
//     if (category) filter["category.name"] = new RegExp(`^${category}$`, "i");
//     if (productType)
//       filter["productType.name"] = new RegExp(`^${productType}$`, "i");
//     if (color) filter["color.name"] = new RegExp(`^${color}$`, "i");
//     if (status) filter.status = status;

//     // -------------------------
//     // 2️⃣ Global search
//     // -------------------------
//     if (search) {
//       const searchRegex = new RegExp(search, "i");
//       filter.$or = [
//         { title: searchRegex },
//         { "brand.name": searchRegex },
//         { "category.name": searchRegex },
//         { "color.name": searchRegex },
//         { "color.code": searchRegex },
//         { "productType.name": searchRegex },
//         { description: searchRegex },
//         { additionalInformation: searchRegex },
//         { tags: searchRegex },
//         { sku: searchRegex },
//         { unit: searchRegex },
//       ];
//     }

//     // -------------------------
//     // 3️⃣ Sorting (stable)
//     // -------------------------
//     if (category) {
//       sortOptions["brand.name"] = 1;
//       sortOptions["_id"] = 1; // ensure stability
//     } else if (sortBy) {
//       switch (sortBy.toUpperCase()) {
//         case "LTH":
//           sortOptions.price = 1;
//           sortOptions["_id"] = 1;
//           break;
//         case "HTL":
//           sortOptions.price = -1;
//           sortOptions["_id"] = 1;
//           break;
//         default:
//           sortOptions.createdAt = -1;
//           sortOptions["_id"] = 1;
//       }
//     } else {
//       sortOptions.createdAt = -1;
//       sortOptions["_id"] = 1;
//     }

//     // -------------------------
//     // 4️⃣ Query + Count (parallel)
//     // -------------------------
//     const [products, totalCount] = await Promise.all([
//       Product.find(filter)
//         .sort(sortOptions)
//         .skip(skip)
//         .limit(take)
//         .populate("reviews")
//         .lean(),
//       Product.countDocuments(filter),
//     ]);

//     return {
//       products,
//       totalCount,
//       skip,
//       take,
//       totalPages: Math.ceil(totalCount / take),
//     };
//   } catch (error) {
//     console.error("Error in getFilteredPaginatedProductsService:", error);
//     throw new Error("Failed to retrieve products.");
//   }
// };
