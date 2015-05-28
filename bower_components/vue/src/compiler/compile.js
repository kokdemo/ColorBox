var _ = require('../util')
var config = require('../config')
var textParser = require('../parsers/text')
var dirParser = require('../parsers/directive')
var templateParser = require('../parsers/template')

module.exports = compile

/**
 * Compile a template and return a reusable composite link
 * function, which recursively contains more link functions
 * inside. This top level compile function should only be
 * called on instance root nodes.
 *
 * @param {Element|DocumentFragment} el
 * @param {Object} options
 * @param {Boolean} partial
 * @param {Boolean} transcluded
 * @return {Function}
 */

function compile (el, options, partial, transcluded) {
  var isBlock = el.nodeType === 11
  // link function for param attributes.
  var params = options.paramAttributes
  var paramsLinkFn = params && !partial && !transcluded && !isBlock
    ? compileParamAttributes(el, params, options)
    : null
  // link function for the node itself.
  // if this is a block instance, we return a link function
  // for the attributes found on the container, if any.
  // options._containerAttrs are collected during transclusion.
  var nodeLinkFn = isBlock
    ? compileBlockContainer(options._containerAttrs, params, options)
    : compileNode(el, options)
  // link function for the childNodes
  var childLinkFn =
    !(nodeLinkFn && nodeLinkFn.terminal) &&
    el.tagName !== 'SCRIPT' &&
    el.hasChildNodes()
      ? compileNodeList(el.childNodes, options)
      : null

  /**
   * A composite linker function to be called on a already
   * compiled piece of DOM, which instantiates all directive
   * instances.
   *
   * @param {Vue} vm
   * @param {Element|DocumentFragment} el
   * @return {Function|undefined}
   */

  function compositeLinkFn (vm, el) {
    var originalDirCount = vm._directives.length
    var parentOriginalDirCount =
      vm.$parent && vm.$parent._directives.length
    if (paramsLinkFn) {
      paramsLinkFn(vm, el)
    }
    // cache childNodes before linking parent, fix #657
    var childNodes = _.toArray(el.childNodes)
    // if this is a transcluded compile, linkers need to be
    // called in source scope, and the host needs to be
    // passed down.
    var source = transcluded ? vm.$parent : vm
    var host = transcluded ? vm : undefined
    // link
    if (nodeLinkFn) nodeLinkFn(source, el, host)
    if (childLinkFn) childLinkFn(source, childNodes, host)

    /**
     * If this is a partial compile, the linker function
     * returns an unlink function that tearsdown all
     * directives instances generated during the partial
     * linking.
     */

    if (partial && !transcluded) {
      var selfDirs = vm._directives.slice(originalDirCount)
      var parentDirs = vm.$parent &&
        vm.$parent._directives.slice(parentOriginalDirCount)

      var teardownDirs = function (vm, dirs) {
        var i = dirs.length
        while (i--) {
          dirs[i]._teardown()
        }
        i = vm._directives.indexOf(dirs[0])
        vm._directives.splice(i, dirs.length)
      }

      return function unlink () {
        teardownDirs(vm, selfDirs)
        if (parentDirs) {
          teardownDirs(vm.$parent, parentDirs)
        }
      }
    }
  }

  // transcluded linkFns are terminal, because it takes
  // over the entire sub-tree.
  if (transcluded) {
    compositeLinkFn.terminal = true
  }

  return compositeLinkFn
}

/**
 * Compile the attributes found on a "block container" -
 * i.e. the container node in the parent tempate of a block
 * instance. We are only concerned with v-with and
 * paramAttributes here.
 *
 * @param {Object} attrs - a map of attr name/value pairs
 * @param {Array} params - param attributes list
 * @param {Object} options
 * @return {Function}
 */

function compileBlockContainer (attrs, params, options) {
  if (!attrs) return null
  var paramsLinkFn = params
    ? compileParamAttributes(attrs, params, options)
    : null
  var withVal = attrs[config.prefix + 'with']
  var withLinkFn = null
  if (withVal) {
    var descriptor = dirParser.parse(withVal)[0]
    var def = options.directives['with']
    withLinkFn = function (vm, el) {
      vm._bindDir('with', el, descriptor, def)   
    }
  }
  return function blockContainerLinkFn (vm) {
    // explicitly passing null to the linkers
    // since v-with doesn't need a real element
    if (paramsLinkFn) paramsLinkFn(vm, null)
    if (withLinkFn) withLinkFn(vm, null)
  }
}

/**
 * Compile a node and return a nodeLinkFn based on the
 * node type.
 *
 * @param {Node} node
 * @param {Object} options
 * @return {Function|null}
 */

function compileNode (node, options) {
  var type = node.nodeType
  if (type === 1 && node.tagName !== 'SCRIPT') {
    return compileElement(node, options)
  } else if (type === 3 && config.interpolate && node.data.trim()) {
    return compileTextNode(node, options)
  } else {
    return null
  }
}

/**
 * Compile an element and return a nodeLinkFn.
 *
 * @param {Element} el
 * @param {Object} options
 * @return {Function|null}
 */

function compileElement (el, options) {
  if (checkTransclusion(el)) {
    // unwrap textNode
    if (el.hasAttribute('__vue__wrap')) {
      el = el.firstChild
    }
    return compile(el, options._parent.$options, true, true)
  }
  var linkFn, tag, component
  // check custom element component, but only on non-root
  if (!el.__vue__) {
    tag = el.tagName.toLowerCase()
    component =
      tag.indexOf('-') > 0 &&
      options.components[tag]
    if (component) {
      el.setAttribute(config.prefix + 'component', tag)
    }
  }
  if (component || el.hasAttributes()) {
    // check terminal direcitves
    linkFn = checkTerminalDirectives(el, options)
    // if not terminal, build normal link function
    if (!linkFn) {
      var dirs = collectDirectives(el, options)
      linkFn = dirs.length
        ? makeNodeLinkFn(dirs)
        : null
    }
  }
  // if the element is a textarea, we need to interpolate
  // its content on initial render.
  if (el.tagName === 'TEXTAREA') {
    var realLinkFn = linkFn
    linkFn = function (vm, el) {
      el.value = vm.$interpolate(el.value)
      if (realLinkFn) realLinkFn(vm, el)
    }
    linkFn.terminal = true
  }
  return linkFn
}

/**
 * Build a link function for all directives on a single node.
 *
 * @param {Array} directives
 * @return {Function} directivesLinkFn
 */

function makeNodeLinkFn (directives) {
  return function nodeLinkFn (vm, el, host) {
    // reverse apply because it's sorted low to high
    var i = directives.length
    var dir, j, k, target
    while (i--) {
      dir = directives[i]
      // a directive can be transcluded if it's written
      // on a component's container in its parent tempalte.
      target = dir.transcluded
        ? vm.$parent
        : vm
      if (dir._link) {
        // custom link fn
        dir._link(target, el)
      } else {
        k = dir.descriptors.length
        for (j = 0; j < k; j++) {
          target._bindDir(dir.name, el,
            dir.descriptors[j], dir.def, host)
        }
      }
    }
  }
}

/**
 * Compile a textNode and return a nodeLinkFn.
 *
 * @param {TextNode} node
 * @param {Object} options
 * @return {Function|null} textNodeLinkFn
 */

function compileTextNode (node, options) {
  var tokens = textParser.parse(node.data)
  if (!tokens) {
    return null
  }
  var frag = document.createDocumentFragment()
  var el, token
  for (var i = 0, l = tokens.length; i < l; i++) {
    token = tokens[i]
    el = token.tag
      ? processTextToken(token, options)
      : document.createTextNode(token.value)
    frag.appendChild(el)
  }
  return makeTextNodeLinkFn(tokens, frag, options)
}

/**
 * Process a single text token.
 *
 * @param {Object} token
 * @param {Object} options
 * @return {Node}
 */

function processTextToken (token, options) {
  var el
  if (token.oneTime) {
    el = document.createTextNode(token.value)
  } else {
    if (token.html) {
      el = document.createComment('v-html')
      setTokenType('html')
    } else if (token.partial) {
      el = document.createComment('v-partial')
      setTokenType('partial')
    } else {
      // IE will clean up empty textNodes during
      // frag.cloneNode(true), so we have to give it
      // something here...
      el = document.createTextNode(' ')
      setTokenType('text')
    }
  }
  function setTokenType (type) {
    token.type = type
    token.def = options.directives[type]
    token.descriptor = dirParser.parse(token.value)[0]
  }
  return el
}

/**
 * Build a function that processes a textNode.
 *
 * @param {Array<Object>} tokens
 * @param {DocumentFragment} frag
 */

function makeTextNodeLinkFn (tokens, frag) {
  return function textNodeLinkFn (vm, el) {
    var fragClone = frag.cloneNode(true)
    var childNodes = _.toArray(fragClone.childNodes)
    var token, value, node
    for (var i = 0, l = tokens.length; i < l; i++) {
      token = tokens[i]
      value = token.value
      if (token.tag) {
        node = childNodes[i]
        if (token.oneTime) {
          value = vm.$eval(value)
          if (token.html) {
            _.replace(node, templateParser.parse(value, true))
          } else {
            node.data = value
          }
        } else {
          vm._bindDir(token.type, node,
                      token.descriptor, token.def)
        }
      }
    }
    _.replace(el, fragClone)
  }
}

/**
 * Compile a node list and return a childLinkFn.
 *
 * @param {NodeList} nodeList
 * @param {Object} options
 * @return {Function|undefined}
 */

function compileNodeList (nodeList, options) {
  var linkFns = []
  var nodeLinkFn, childLinkFn, node
  for (var i = 0, l = nodeList.length; i < l; i++) {
    node = nodeList[i]
    nodeLinkFn = compileNode(node, options)
    childLinkFn =
      !(nodeLinkFn && nodeLinkFn.terminal) &&
      node.tagName !== 'SCRIPT' &&
      node.hasChildNodes()
        ? compileNodeList(node.childNodes, options)
        : null
    linkFns.push(nodeLinkFn, childLinkFn)
  }
  return linkFns.length
    ? makeChildLinkFn(linkFns)
    : null
}

/**
 * Make a child link function for a node's childNodes.
 *
 * @param {Array<Function>} linkFns
 * @return {Function} childLinkFn
 */

function makeChildLinkFn (linkFns) {
  return function childLinkFn (vm, nodes, host) {
    var node, nodeLinkFn, childrenLinkFn
    for (var i = 0, n = 0, l = linkFns.length; i < l; n++) {
      node = nodes[n]
      nodeLinkFn = linkFns[i++]
      childrenLinkFn = linkFns[i++]
      // cache childNodes before linking parent, fix #657
      var childNodes = _.toArray(node.childNodes)
      if (nodeLinkFn) {
        nodeLinkFn(vm, node, host)
      }
      if (childrenLinkFn) {
        childrenLinkFn(vm, childNodes, host)
      }
    }
  }
}

/**
 * Compile param attributes on a root element and return
 * a paramAttributes link function.
 *
 * @param {Element|Object} el
 * @param {Array} attrs
 * @param {Object} options
 * @return {Function} paramsLinkFn
 */

function compileParamAttributes (el, attrs, options) {
  var params = []
  var isEl = el.nodeType
  var i = attrs.length
  var name, value, param
  while (i--) {
    name = attrs[i]
    if (/[A-Z]/.test(name)) {
      _.warn(
        'You seem to be using camelCase for a paramAttribute, ' +
        'but HTML doesn\'t differentiate between upper and ' +
        'lower case. You should use hyphen-delimited ' +
        'attribute names. For more info see ' +
        'http://vuejs.org/api/options.html#paramAttributes'
      )
    }
    value = isEl ? el.getAttribute(name) : el[name]
    if (value !== null) {
      param = {
        name: name,
        value: value
      }
      var tokens = textParser.parse(value)
      if (tokens) {
        if (isEl) el.removeAttribute(name)
        if (tokens.length > 1) {
          _.warn(
            'Invalid param attribute binding: "' +
            name + '="' + value + '"' +
            '\nDon\'t mix binding tags with plain text ' +
            'in param attribute bindings.'
          )
          continue
        } else {
          param.dynamic = true
          param.value = tokens[0].value
        }
      }
      params.push(param)
    }
  }
  return makeParamsLinkFn(params, options)
}

/**
 * Build a function that applies param attributes to a vm.
 *
 * @param {Array} params
 * @param {Object} options
 * @return {Function} paramsLinkFn
 */

var dataAttrRE = /^data-/

function makeParamsLinkFn (params, options) {
  var def = options.directives['with']
  return function paramsLinkFn (vm, el) {
    var i = params.length
    var param, path
    while (i--) {
      param = params[i]
      // params could contain dashes, which will be
      // interpreted as minus calculations by the parser
      // so we need to wrap the path here
      path = _.camelize(param.name.replace(dataAttrRE, ''))
      if (param.dynamic) {
        // dynamic param attribtues are bound as v-with.
        // we can directly duck the descriptor here beacuse
        // param attributes cannot use expressions or
        // filters.
        vm._bindDir('with', el, {
          arg: path,
          expression: param.value
        }, def)
      } else {
        // just set once
        vm.$set(path, param.value)
      }
    }
  }
}

/**
 * Check an element for terminal directives in fixed order.
 * If it finds one, return a terminal link function.
 *
 * @param {Element} el
 * @param {Object} options
 * @return {Function} terminalLinkFn
 */

var terminalDirectives = [
  'repeat',
  'if',
  'component'
]

function skip () {}
skip.terminal = true

function checkTerminalDirectives (el, options) {
  if (_.attr(el, 'pre') !== null) {
    return skip
  }
  var value, dirName
  /* jshint boss: true */
  for (var i = 0; i < 3; i++) {
    dirName = terminalDirectives[i]
    if (value = _.attr(el, dirName)) {
      return makeTerminalNodeLinkFn(el, dirName, value, options)
    }
  }
}

/**
 * Build a node link function for a terminal directive.
 * A terminal link function terminates the current
 * compilation recursion and handles compilation of the
 * subtree in the directive.
 *
 * @param {Element} el
 * @param {String} dirName
 * @param {String} value
 * @param {Object} options
 * @return {Function} terminalLinkFn
 */

function makeTerminalNodeLinkFn (el, dirName, value, options) {
  var descriptor = dirParser.parse(value)[0]
  var def = options.directives[dirName]
  var fn = function terminalNodeLinkFn (vm, el, host) {
    vm._bindDir(dirName, el, descriptor, def, host)
  }
  fn.terminal = true
  return fn
}

/**
 * Collect the directives on an element.
 *
 * @param {Element} el
 * @param {Object} options
 * @return {Array}
 */

function collectDirectives (el, options) {
  var attrs = _.toArray(el.attributes)
  var i = attrs.length
  var dirs = []
  var attr, attrName, dir, dirName, dirDef, transcluded
  while (i--) {
    attr = attrs[i]
    attrName = attr.name
    transcluded =
      options._transcludedAttrs &&
      options._transcludedAttrs[attrName]
    if (attrName.indexOf(config.prefix) === 0) {
      dirName = attrName.slice(config.prefix.length)
      dirDef = options.directives[dirName]
      _.assertAsset(dirDef, 'directive', dirName)
      if (dirDef) {
        dirs.push({
          name: dirName,
          descriptors: dirParser.parse(attr.value),
          def: dirDef,
          transcluded: transcluded
        })
      }
    } else if (config.interpolate) {
      dir = collectAttrDirective(el, attrName, attr.value,
                                 options)
      if (dir) {
        dir.transcluded = transcluded
        dirs.push(dir)
      }
    }
  }
  // sort by priority, LOW to HIGH
  dirs.sort(directiveComparator)
  return dirs
}

/**
 * Check an attribute for potential dynamic bindings,
 * and return a directive object.
 *
 * @param {Element} el
 * @param {String} name
 * @param {String} value
 * @param {Object} options
 * @return {Object}
 */

function collectAttrDirective (el, name, value, options) {
  var tokens = textParser.parse(value)
  if (tokens) {
    var def = options.directives.attr
    var i = tokens.length
    var allOneTime = true
    while (i--) {
      var token = tokens[i]
      if (token.tag && !token.oneTime) {
        allOneTime = false
      }
    }
    return {
      def: def,
      _link: allOneTime
        ? function (vm, el) {
            el.setAttribute(name, vm.$interpolate(value))
          }
        : function (vm, el) {
            var value = textParser.tokensToExp(tokens, vm)
            var desc = dirParser.parse(name + ':' + value)[0]
            vm._bindDir('attr', el, desc, def)
          }
    }
  }
}

/**
 * Directive priority sort comparator
 *
 * @param {Object} a
 * @param {Object} b
 */

function directiveComparator (a, b) {
  a = a.def.priority || 0
  b = b.def.priority || 0
  return a > b ? 1 : -1
}

/**
 * Check whether an element is transcluded
 *
 * @param {Element} el
 * @return {Boolean}
 */

var transcludedFlagAttr = '__vue__transcluded'
function checkTransclusion (el) {
  if (el.nodeType === 1 && el.hasAttribute(transcludedFlagAttr)) {
    el.removeAttribute(transcludedFlagAttr)
    return true
  }
}