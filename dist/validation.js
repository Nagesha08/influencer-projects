const commonFields = new Set(["first_name", "last_name", "phone", "timezone"]);
const influencerFields = new Set([
    "display_name", "bio", "niche", "instagram_url", "tiktok_url", "youtube_url",
    "x_url", "facebook_url", "website_url", "location", "follower_count", "engagement_rate",
]);
function validateObject(body, fields) {
    if (!body || typeof body !== "object" || Array.isArray(body))
        return "Request body must be a JSON object";
    const unknownField = Object.keys(body).find((field) => !fields.has(field));
    return unknownField ? `Unknown field: ${unknownField}` : null;
}
function requiredString(body, field) {
    return typeof body[field] === "string" && body[field].trim().length > 0;
}
function optionalString(body, field) {
    return body[field] === undefined || body[field] === null || typeof body[field] === "string";
}
function validUrl(value) {
    if (value === undefined || value === null || value === "")
        return true;
    if (typeof value !== "string")
        return false;
    try {
        const url = new URL(value);
        return url.protocol === "http:" || url.protocol === "https:";
    }
    catch {
        return false;
    }
}
export function validateCommonProfile(body) {
    const objectError = validateObject(body, commonFields);
    if (objectError)
        return objectError;
    const values = body;
    if (!requiredString(values, "first_name") || !requiredString(values, "last_name"))
        return "first_name and last_name are required";
    if (!["phone", "timezone"].every((field) => optionalString(values, field)))
        return "phone and timezone must be strings";
    return null;
}
export function validateInfluencerProfile(body) {
    const objectError = validateObject(body, influencerFields);
    if (objectError)
        return objectError;
    const values = body;
    if (!requiredString(values, "display_name") || !requiredString(values, "niche"))
        return "display_name and niche are required";
    const urlFields = ["instagram_url", "tiktok_url", "youtube_url", "x_url", "facebook_url", "website_url"];
    if (!urlFields.some((field) => typeof values[field] === "string" && values[field].trim()))
        return "At least one social-media or website URL is required";
    if (!urlFields.every((field) => validUrl(values[field])))
        return "Social-media and website URLs must use http or https";
    if (values.follower_count !== undefined && (!Number.isInteger(values.follower_count) || Number(values.follower_count) < 0))
        return "follower_count must be a nonnegative integer";
    if (values.engagement_rate !== undefined && (typeof values.engagement_rate !== "number" || values.engagement_rate < 0 || values.engagement_rate > 100))
        return "engagement_rate must be a number between 0 and 100";
    return null;
}
