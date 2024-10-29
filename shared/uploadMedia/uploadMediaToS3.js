import AdmZip from "adm-zip";
import fetch from "node-fetch";

import AWS from "aws-sdk";

const s3 = new AWS.S3({
  accessKeyId: process.env.AWS_ACCESS_KEY_ID,
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  region: process.env.AWS_REGION,
});

export const uploadMedia = async (fileUrl, productTitle, folderPath) => {
  console.log("Uploading file to S3...", fileUrl, productTitle, folderPath);
  const response = await fetch(fileUrl);
  const zipBuffer = Buffer.from(await response.arrayBuffer());

  let zip;
  try {
    zip = new AdmZip(zipBuffer);
  } catch (error) {
    return { error: true, fileUrl };
  }

  const zipEntries = zip.getEntries();

  const mediaPromises = zipEntries.map(async (zipEntry, index) => {
    const fileName = `${productTitle}_${index + 2}.${zipEntry.entryName
      .split(".")
      .pop()}`;
    const fileBuffer = zipEntry.getData();

    const mediaData = await uploadMediaToS3(fileBuffer, fileName, folderPath);

    return mediaData;
  });

  const mediaRecords = await Promise.all(mediaPromises);
  return { error: false, mediaRecords };
};

export const uploadMediaToS3 = async (fileBuffer, fileName, folderPath) => {
  const params = {
    Bucket: process.env.AWS_BUCKET_NAME,
    Key: `${folderPath}/${fileName}`,
    Body: fileBuffer,
    ContentType: "application/octet-stream",
    ACL: "public-read",
  };

  try {
    const data = await s3.upload(params).promise();
    return { link: data.Location };
  } catch (err) {
    console.error("Error uploading file to S3:", err);
    throw err;
  }
};
