// ISSUES
// why do attributes end up with a (="") when none are provdided? (eg: <div class>)
// check content that resembles a tag, (ie, with < and >)

class Element {
    constructor(type, value, content) {
        this.type = type;
        this.value = value;
        this.content = content;
    }
}

class MatrixCell {
    constructor(html1Element, html2Element, value = null) {
        this.html1Element = html1Element;
        this.html2Element = html2Element;
        this.value = value;
    }
}

// Inheritance? Single DiffFragment class?
class Inserted {
    constructor(element) {
        this.tag = 'ins'
        this.element = element;
    }
}

class Deleted {
    constructor(element) {
        this.tag = 'del'
        this.element = element;
    }
}

class Transformation {
    constructor(element) {
        this.tag = 'transformation'
        this.element = element;
    }
}

class Unchanged {
    constructor(element) {
        this.tag = 'span'
        this.element = element;
    }
}

const SplitBy = {
    // how to keep delimiters: 
    // https://medium.com/@shemar.gordon32/how-to-split-and-keep-the-delimiter-s-d433fb697c65
    HtmlTag: /(?=<[^<]*?>)|(?<=<[^<]*?>)/g, // split by and retain html tag <[^<]*?> 
    Character: '',
    NonAlphanumeric: /(\W)/,
}

const defaultDelimiter = SplitBy.NonAlphanumeric;
let selectedDelimiter = null;

// for debugging purposes 
function display(matrix) {
    const leftMarginPadding = 25;
    const valuePadding = 2

    const html2 = ' '.repeat(leftMarginPadding) + '$' + matrix[0].map(row => row.html2Element.value).join('  ');
    const body = matrix
        .map((row, i) => 
             `${(i === 0 ? '$' : String(row[0].html1Element.value)).padStart(leftMarginPadding)}` + 
             `${row.map(column => String(column.value).padStart(valuePadding, ' ')).join(' ')}`)
        .join('\n');

    console.log(`${html2}\n${body}`);
}

function toDelimitedStringArray(content, delimiter) {
    return content
        .split(delimiter)
        .map(fragment => new Element('string', fragment, fragment));
}

function standardiseElementsForComparison(elements) {
    if (typeof elements === 'string') { 
        // the SplitBy.NonAlphanumeric delimiter helps to split content and tag information in the most meaningful way
        // change delimiter parameter to selectedDelimiter for buttons to take effect
        elements = toDelimitedStringArray(elements, selectedDelimiter);
    }

    const comparables = [...elements]
        .map(e => {
            switch(e.nodeType) {
                case undefined: // ie: string
                    return e;   // already converted to Element, above
                case Node.TEXT_NODE: 
                case Node.COMMENT_NODE:
                    // the SplitBy.Character delimiter helps to split changes to whole nodes in the most meaningful way
                    // change delimiter parameter to selectedDelimiter for buttons to take effect
                    return toDelimitedStringArray(e.textContent, selectedDelimiter); 
                case Node.ELEMENT_NODE: 
                    return new Element('element_node', e, e.outerHTML);
                default: 
                    throw `unhandled node type: '${e.nodeName}'`;
            } 
        })
        .flat();

    return comparables;
}

// in accordance with the Longest Common Sequence algorithm 
// https://www.geeksforgeeks.org/longest-common-subsequence-dp-4/
function buildMatrix(html1Elements, html2Elements) {
    html1Elements = standardiseElementsForComparison(html1Elements);
    html2Elements = standardiseElementsForComparison(html2Elements);

    const matrix = ['$', ...html1Elements] // rows
        .fill(null, html1Elements.length + 1)           
        .map(node1Child => ['$', ...html2Elements] // columns
            .fill(null, html2Elements.length + 1)
            .map(node2Child => new MatrixCell(node1Child, node2Child, 0)));

    for(let node1Index = 0; node1Index < html1Elements.length; node1Index++) {
        for(let node2Index = 0; node2Index < html2Elements.length; node2Index++) {
            const node1Child = html1Elements[node1Index];
            const node2Child = html2Elements[node2Index];
            const northWestValue = (matrix[node1Index][node2Index]).value; // offset by the phi values
            const northValue = (matrix[node1Index][node2Index + 1]).value;
            const westValue = (matrix[node1Index + 1][node2Index]).value;
            const isMatch = node1Child.content === node2Child.content;
            const cellValue = isMatch ? northWestValue + 1 : Math.max(northValue, westValue);
                         
            // current value
            (matrix[node1Index + 1][node2Index + 1]).value = cellValue;
        }
    }

    return matrix;
}

function traverseMatrixForComparisons(matrix) {
    // start at the last cell
    let row = matrix.length - 1;
    let column = matrix[0].length - 1;  
    let current = (matrix[row][column]); // how can we remove this repetition (below)
    let comparisons = [];

    while (row > 0 || column > 0) {
        current = (matrix[row][column]);
        const northElement = row > 0 ? matrix[row - 1][column] : null;
        const westElement = column > 0 ? matrix[row][column - 1] : null;
        const previousComparison = comparisons.slice(-1)[0];
        const isDeletion = northElement && northElement.value === current.value;
        const isInsertion = westElement && westElement.value === current.value;

        // deletions that occur immediately after insertions do not represent true deletions and insertions, 
        // but in fact a transformation caused by a deletion or/and insertion nested somewhere within its outerHTML. 
        // This check ensures that these transformation are identified immediately, so that the true deletions / insertions 
        // can be identified later by recursing the 'getChanges' function.
        if (isDeletion && previousComparison instanceof Inserted) {
            if (previousComparison.element.html1Element.type === 'string') { // could the html2Element.type differ?
                comparisons.push(new Deleted(current));
                
                if (previousComparison.element.html2Element.type !== 'string') throw 'html2Element not accounted for';
            } else {
                const matrixCell = new MatrixCell(
                    previousComparison.element.html1Element, 
                    previousComparison.element.html2Element);

                comparisons[comparisons.length - 1] = new Transformation(matrixCell);
            }

            row--;
        }
        else if(isInsertion) {  
            comparisons.push(new Inserted(current));
            column--;                                               
        }
        // handled after insertions so that when reversed, deletions appear before insertions
        else if (isDeletion) {
            comparisons.push(new Deleted(current))
            row--;
        }
        else {
            comparisons.push(new Unchanged(current));
            row--;
            column--;
        }
    }

    return comparisons;
}

function getExternalTags(kvp) {
    const key = kvp[0];
    const value = kvp[1]

    const tag = '(<[^>]+>)';
    const allContent = '(.|\n)*?';
    const externalTagRegex = new RegExp(`^${tag}${allContent}${tag}?$`);

    const externalTags = value.content.match(externalTagRegex);
    const element = {};
    
    element[key] = {
        openTag: externalTags[1],
        closeTag: externalTags[3] || '',
        bothTags: externalTags.slice(1).join('') // slicing removes the entire outerHTML used for our match input, which we know by now does not match
    }

    return element
}

function recurseGetChangesFromTransformation(transformation) {
    const html1Element = transformation.element.html1Element;
    const html2Element = transformation.element.html2Element;

    // both already strings
    if (html1Element.type === 'string' && html2Element.type === 'string') {
        return transformation;
    }

    if (html1Element.type === 'string') {
        return getChanges(html1Element.content, html2Element.value.outerHTML);
    }

    if (html2Element.type === 'string') {
        return getChanges(html1Element.value.outerHTML, html2Element.content);
    }

    if (html1Element.value.childElementCount === 0 || html2Element.value.childElementCount === 0) {
        return getChanges(html1Element.content, html2Element.content);
    }

    // now we know that both are nodes with childNodes
    const externalTags = Object
        .entries(transformation.element)
        .filter(kvp => kvp[1] !== null)
        .reduce((aggregation, kvp) => { 
            return { ...aggregation, ...getExternalTags(kvp) }
        }, {});

        // we can check the equality of each first if better performance is required
        return [
            ...getChanges(externalTags.html1Element.closeTag, externalTags.html2Element.closeTag),
            ...getChanges(html1Element.value.childNodes, html2Element.value.childNodes), 
            ...getChanges(externalTags.html1Element.openTag, externalTags.html2Element.openTag)
        ];
}

function resolveElementFromComparison(comparison) {
    switch(comparison.constructor) {
        case Inserted: 
            return comparison.element.html2Element.content;
        case Deleted: 
        case Unchanged:
            return comparison.element.html1Element.content;
        default:
            throw `${comparisona.constructor.name} not recognised`;
    }
}

function getChanges(html1Elements, html2Elements) {
    // html1Elements may either be an array of DOM Nodes or an outerHTML string 
    const matrix = buildMatrix(html1Elements, html2Elements);
    
    display(matrix); // useful for clarity and debugging

    let comparisons = traverseMatrixForComparisons(matrix);

    comparisons = comparisons
        .map(comparison => {
            if (comparison instanceof Transformation) {
                return recurseGetChangesFromTransformation(comparison);
            }

            comparison.element = resolveElementFromComparison(comparison);
            return comparison;
        })
        .flat();

    return comparisons;
}

function groupConsecutiveLikeComparisons(aggregation, change) {
    const previousChangeType = aggregation.slice(-1)[0];

    if (!previousChangeType || previousChangeType.tag !== change.tag) {
        change.element = [change.element]
        aggregation.push(change)
    } else {
        previousChangeType.element.push(change.element);
    }

    return aggregation;
}

function joinElementFragments(change) {
    change.element = change.element.join('');
    return change;
}

function toHtmlFragment(change) {
    // temporarily enclosed using square brackets to distinguish from the angle brackets of existing tags
    // using the tag should be a stepping stone to defining the change type in a more generic Change class.
    const toOpenTag = change => change.tag === 'span' ? '' : `[${change.tag}]`;
    const toCloseTag = change => change.tag === 'span' ? '' : `[/${change.tag}]`;

    const result = toOpenTag(change) + (change.element) + toCloseTag(change);
    return result;
}

function encode(html) {
    return html
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
}

function handleUnEncodedHtml(htmlTags) {
    const tagStart = '(<\\/?.*?)';
    const possibleDeleteElement = '(\\[del\\].*?\\[\\/del\\])?';
    const elelmentContent = '(.*?)';
    const possibleInsertElement = '(\\[ins\\](.+?)\\[\\/ins\\])?';
    const tagEnd = '(.*?>)';
    const possibleChangeTag = '(\\[\\/?(ins|del)\\])?'

    return htmlTags
        .map(fragment => fragment.replace(new RegExp(`
            ${tagStart}
            ${possibleDeleteElement}
            ${elelmentContent}
            ${possibleInsertElement}
            ${tagEnd}`, 'g'), 
            '$1' + '$3' + '$5' + '$6')) // retain everything except for delete elements and insert tags
        .map(fragment => fragment.trim())
        .filter(fragment => !(new RegExp(`^(\\s*${possibleChangeTag}\\s*)*$`)).test(fragment)); // remove fragments with not content (defined by the first map as being between tags)
}

function encodedHtml(htmlTags) {
    return htmlTags.map(fragment => fragment
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;'))
}

function buildHtmlComparison(changes, encoded = true) {
    // this can be chained but best left unchained for debugging purposes
    const clonedChanges = JSON.parse(JSON.stringify(changes)); // make deep copy
    const groupedChanges = clonedChanges.reduce(groupConsecutiveLikeComparisons, []);
    const joinedFragments = groupedChanges.map(joinElementFragments);
    const htmlFragments = joinedFragments.map(toHtmlFragment);
    const temporaryHtml = htmlFragments.join('');         

    // split on and retain tags, (including any chnange tags)   
    // (any issues with formatting are likely to arise due to this regex split)    
    const possibleOpenChangeTag = '(\\[ins\\]|\\[del\\])?';
    const tag = '<[^<]+?>';
    const possibleCloseChangeTag = '(\\[\\/ins\\]|\\[\\/del\\])?'          
    const splitByTags = temporaryHtml.split(new RegExp(`(${possibleOpenChangeTag}\\s*${tag}${possibleCloseChangeTag})`, 'g'));
    
    // remove unwanted elements added by the brackets of the regex split    
    let htmlTags = splitByTags.filter((fragment, i) => i % 4 < 2); 
    
    // ensure all linebreaks present, 
    // (tbh, I'm not really sure what's happening here, it just seems to work in some cases)
    // htmlTags = htmlTags.map(fragment => fragment === '' ? '\n' : fragment); 

    const htmlEncoding = encoded ? encodedHtml(htmlTags) : handleUnEncodedHtml(htmlTags);

    // replace temporary change brackets with angle brackets 
    const temporaryChangeTag = '\\[(\\/?(ins|del))\\]';
    const finalChangeTags = htmlEncoding.map(fragment => fragment.replace(new RegExp(temporaryChangeTag, 'g'), '<$1>')); 
    
    const htmlResult = finalChangeTags.join('');

    return htmlResult;
}

function run(html1, html2, delimiter) {
    selectedDelimiter = delimiter;

    const node1 = document.createRange().createContextualFragment(html1);
    const node2 = document.createRange().createContextualFragment(html2);

    const changes = getChanges(node1.children, node2.children).reverse();   // reversed as the matrix was originally traversed in reverse
        
    htmlDifference.innerHTML = buildHtmlComparison(changes);
    result.innerHTML = buildHtmlComparison(changes, false);
}

// UI --------------------------------------------------------
const html1 = document.getElementById('html1');
const html2 = document.getElementById('html2');
const result = document.getElementById('result');
const htmlDifference = document.getElementById('html-difference');

document.getElementById('char-separator').addEventListener('click', () => run(html1.value, html2.value, SplitBy.Character));
document.getElementById('space-separator').addEventListener('click', () => run(html1.value, html2.value, SplitBy.NonAlphanumeric));
document.getElementById('tag-separator').addEventListener('click', () => run(html1.value, html2.value, SplitBy.HtmlTag));

html1.value = `<div><ul><li>constant</li></ul><ul><li>old stuff</li></ul></div>`;
html2.value = `<div><ul><li>constant</li></ul><ul><li>new stuff</li></ul></div>`;

run(html1.value, html2.value, SplitBy.NonAlphanumeric);
// ----------------------------------------------------------