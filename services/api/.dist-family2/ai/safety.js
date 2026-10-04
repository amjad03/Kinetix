/**
 * Safety checks on what goes into and comes out of the models. A first line of defence on
 * top of the system prompt; the full classifier (with Hindi and Kannada lists) runs on the
 * AI servers. Matching is on whole words, case-insensitive.
 */
const ALWAYS = ['porn', 'pornography', 'nude', 'nudes', 'rape', 'suicide method', 'how to kill', 'make a bomb', 'bomb making', 'buy drugs'];
/**
 * Extra terms for schools, where students are under 18. Kept narrow on purpose: syllabus
 * topics such as "sex chromosomes", "alcohols" (Class 10 chemistry) or wars in history must
 * still work.
 */
const MINORS = ['sexy', 'beer', 'whisky', 'vodka', 'cigarettes?', 'gambling', 'betting', 'casino', 'weed', 'ganja'];
const pattern = (terms) => new RegExp(`\\b(${terms.map((t) => t.replace(/ /g, '\\s+')).join('|')})\\b`, 'i');
const always = pattern(ALWAYS);
const minors = pattern([...ALWAYS, ...MINORS]);
export function unsafeTerm(text, forMinors) {
    const m = (forMinors ? minors : always).exec(text);
    return m ? m[1].toLowerCase() : null;
}
/** Every string in a JSON value, for checking model output. */
export function allText(value) {
    if (typeof value === 'string')
        return value;
    if (Array.isArray(value))
        return value.map(allText).join('\n');
    if (value && typeof value === 'object')
        return Object.values(value).map(allText).join('\n');
    return '';
}
//# sourceMappingURL=safety.js.map