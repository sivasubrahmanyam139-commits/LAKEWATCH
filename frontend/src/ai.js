import { pipeline } from "@huggingface/transformers";

let classifier = null;

export async function analyzeImage(image) {
  if (!classifier) {
    classifier = await pipeline(
      "zero-shot-image-classification",
      "Xenova/clip-vit-base-patch32"
    );
  }

  const labels = [
    "a waterlogged road",
    "a blocked drain",
    "an open manhole",
    "garbage dumping",
    "a normal road",
  ];

  const result = await classifier(image, labels);

  return result;
}