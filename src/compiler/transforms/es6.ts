/// <reference path="../checker.ts" />
/// <refernece path="./destructuring.ts" />
/*@internal*/
namespace ts {
    export function createES6Transformation(transformer: Transformer): Transformation {
        // create local aliases for transformer methods
        let {
            startLexicalEnvironment,
            endLexicalEnvironment,
            getParentNode,
            findAncestorNode,
            getGeneratedNameForNode,
            createTempVariable,
            hoistVariableDeclaration,
            pushNode,
            popNode,
            pipeNode,
            pipeNodes,
            mapNode,
            mapNodes,
            flattenNode,
            visitNode,
            visitNodes,
            visitStatement,
            visitConciseBody,
            visitFunctionBody,
            visitModuleBody,
            visitSourceFile,
            accept,
        } = transformer;

        let compilerOptions = transformer.getCompilerOptions();
        let languageVersion = compilerOptions.target || ScriptTarget.ES3;
        let resolver = transformer.getEmitResolver();
        let currentSourceFile: SourceFile;
        let noSubstitution: boolean[] = [];
        let savedBindingIdentifierSubstitution = transformer.getBindingIdentifierSubstitution();
        transformer.setBindingIdentifierSubstitution(substituteBindingIdentifierWithFallback);
        let savedExpressionSubstitution = transformer.getExpressionSubstitution();
        transformer.setExpressionSubstitution(substituteExpressionWithFallback);

        return transformES6;

        function transformES6(node: SourceFile): SourceFile {
            if (node.transformFlags & TransformFlags.ContainsES6) {
                return transformES6Worker(node);
            }

            return node;
        }

        function transformES6Worker(node: SourceFile): SourceFile {
            currentSourceFile = node;
            node = visitSourceFile(node, visitor);
            currentSourceFile = undefined;
            return node;
        }

        /**
         * Transforms a node from ES6 to ES5 if it requires any transformations.
         * @param context Context information for the transform.
         * @param node The node to transform.
         * @remarks
         * This function is intentionally kept small to keep its overhead low.
         *
         * If the node needs direct transformation, it will be passed on to the
         * `transformNodeWorker` function.
         *
         * If any part of its subtree needs transformation, the node will be
         * passed to the fallback `accept` function which will ensure any changes
         * to the subtree will generate new nodes.
         *
         * If no part of this node or its subtree requires transformation, the node
         * is returned, unchanged.
         */
        function visitor(node: Node, write: (node: Node) => void): void {
            if (!node) {
                return;
            }

            if (node.transformFlags & TransformFlags.ES6) {
                visitorWorker(node, write);
            }
            else if (node.transformFlags & TransformFlags.ContainsES6) {
                write(accept(node, visitor));
            }
            else {
                write(node);
            }
        }

        /**
         * Transforms a node from ES6 to ES5.
         * @param context Context information for the transform.
         * @param node The node to transform.
         */
        function visitorWorker(node: Node, write: (node: Node) => void): void {
            switch (node.kind) {
                case SyntaxKind.ClassDeclaration:
                    visitClassDeclaration(<ClassDeclaration>node, write);
                    break;

                case SyntaxKind.ClassExpression:
                    visitClassExpression(<ClassExpression>node, write);
                    break;

                case SyntaxKind.Parameter:
                    visitParameter(<ParameterDeclaration>node, write);
                    break;

                case SyntaxKind.FunctionDeclaration:
                    visitFunctionDeclaration(<FunctionDeclaration>node, write);
                    break;

                case SyntaxKind.ArrowFunction:
                case SyntaxKind.FunctionExpression:
                    visitFunctionExpression(<FunctionExpression>node, write);
                    break;

                case SyntaxKind.VariableStatement:
                    visitVariableStatement(<VariableStatement>node, write);
                    break;

                case SyntaxKind.VariableDeclaration:
                    visitVariableDeclaration(<VariableDeclaration>node, write);
                    break;

                case SyntaxKind.VariableDeclarationList:
                    visitVariableDeclarationList(<VariableDeclarationList>node, write);
                    break;

                case SyntaxKind.ExpressionStatement:
                    visitExpressionStatement(<ExpressionStatement>node, write);
                    break;

                case SyntaxKind.ForOfStatement:
                    visitForOfStatement(<ForOfStatement>node, write);
                    break;

                case SyntaxKind.ObjectLiteralExpression:
                    visitObjectLiteralExpression(<ObjectLiteralExpression>node, write);
                    break;

                case SyntaxKind.ShorthandPropertyAssignment:
                    visitShorthandPropertyAssignment(<ShorthandPropertyAssignment>node, write);
                    break;

                case SyntaxKind.ArrayLiteralExpression:
                    visitArrayLiteralExpression(<ArrayLiteralExpression>node, write);
                    break;

                case SyntaxKind.CallExpression:
                    visitCallExpression(<CallExpression>node, write);
                    break;

                case SyntaxKind.NewExpression:
                    visitNewExpression(<NewExpression>node, write);
                    break;

                case SyntaxKind.BinaryExpression:
                    visitBinaryExpression(<BinaryExpression>node, write);
                    break;

                case SyntaxKind.NoSubstitutionTemplateLiteral:
                case SyntaxKind.TemplateHead:
                case SyntaxKind.TemplateMiddle:
                case SyntaxKind.TemplateTail:
                    visitTemplateLiteral(<LiteralExpression>node, write);
                    break;

                case SyntaxKind.TaggedTemplateExpression:
                    visitTaggedTemplateExpression(<TaggedTemplateExpression>node, write);
                    break;

                case SyntaxKind.TemplateExpression:
                    visitTemplateExpression(<TemplateExpression>node, write);
                    break;

                case SyntaxKind.SuperKeyword:
                    visitSuperKeyword(<PrimaryExpression>node, write);
                    break;

                case SyntaxKind.MethodDeclaration:
                    visitMethodDeclaration(<MethodDeclaration>node, write);
                    break;

                case SyntaxKind.SourceFile:
                    visitSourceFileNode(<SourceFile>node, write);
                    break;

                default:
                    let original = getOriginalNode(node);
                    let location = "";
                    if (!nodeIsSynthesized(original)) {
                        let lineCol = getLineAndCharacterOfPosition(currentSourceFile, node.pos);
                        location = currentSourceFile.fileName + "(" + (lineCol.line + 1) + "," + lineCol.character + "): ";
                    }
                    Debug.fail(`${location}Encountered unhandled node kind ${formatSyntaxKind(node.kind)} when transforming ES6 syntax.`);
                    write(accept(node, visitor));
                    break;
            }
        }

        function formatSyntaxKind(kind: SyntaxKind) {
            let text = String(kind);
            if ((<any>ts).SyntaxKind) {
                text += " (" + (<any>ts).SyntaxKind[kind] + ")";
            }

            return text;
        }

        function visitClassDeclaration(node: ClassDeclaration, write: (node: Statement) => void): void {
            visitClassLikeDeclaration(node, write);
        }

        function visitClassExpression(node: ClassExpression, write: (node: LeftHandSideExpression) => void): void {
            visitClassLikeDeclaration(node, write);
        }

        function visitClassLikeDeclaration(node: ClassExpression | ClassDeclaration, write: (node: Expression | Statement) => void): void {
            let name = getDeclarationName(node);
            let statements = flattenNode(node, emitClassBody);
            let baseTypeNode = getClassExtendsHeritageClauseElement(node);
            let functionParameters: ParameterDeclaration[] = [];
            let functionArguments: Expression[] = [];
            if (baseTypeNode) {
                functionParameters.push(createParameter3("_super"));
                functionArguments.push(visitNode(baseTypeNode.expression, visitor, isExpressionNode));
            }

            let classFunction = createFunctionExpression3(functionParameters, createBlock(statements));
            let classExpression = createCallExpression2(createParenthesizedExpression(classFunction), functionArguments);

            if (isClassDeclaration(node)) {
                let classStatement = createVariableStatement3(name, classExpression, /*location*/ node);
                startOnNewLine(classStatement);
                write(classStatement);
            }
            else {
                write(classExpression);
            }
        }

        function emitClassBody(node: ClassExpression | ClassDeclaration, write: (node: Statement) => void): void {
            startLexicalEnvironment();
            emitExtendsHelperIfNeeded(node, write);
            emitConstructor(node, write);
            emitMemberFunctions(node, write);
            write(createReturnStatement(node.name ? makeSynthesized(node.name) : getGeneratedNameForNode(node)));
            endLexicalEnvironment(write);
        }

        function emitExtendsHelperIfNeeded(node: ClassExpression | ClassDeclaration, write: (node: Statement) => void): void {
            if (getClassExtendsHeritageClauseElement(node)) {
                let extendsExpr = createExtendsHelperCall(getDeclarationName(node));
                let extendsStmt = createExpressionStatement(extendsExpr);
                startOnNewLine(extendsStmt);
                write(extendsStmt);
            }
        }

        function emitConstructor(node: ClassExpression | ClassDeclaration, write: (node: Statement) => void): void {
            let ctor = getFirstConstructorWithBody(node);
            let parameters: ParameterDeclaration[];
            let statements: Statement[];
            if (ctor) {
                parameters = visitNodes(ctor.parameters, visitor, isParameter);
                statements = flattenNode(ctor, emitConstructorBody);
            }
            else {
                parameters = [];
                statements = [];
                if (getClassExtendsHeritageClauseElement(node)) {
                    statements.push(createDefaultSuperCall());
                }
            }

            let name = getDeclarationName(node);
            let constructorFunction = createFunctionDeclaration2(name, parameters, createBlock(statements, /*location*/ undefined, NodeFlags.MultiLine));
            startOnNewLine(constructorFunction);
            write(constructorFunction);
        }

        function emitConstructorBody(constructor: ConstructorDeclaration, write: (node: Statement) => void): void {
            startLexicalEnvironment();
            emitCaptureThisForNodeIfNeeded(constructor, write);
            emitDefaultValueAssignments(constructor, write);
            emitRestParameter(constructor, write);
            pipeNodes(constructor.body.statements, visitor, write);
            endLexicalEnvironment(write);
        }

        function visitParameter(node: ParameterDeclaration, write: (node: ParameterDeclaration) => void): void {
            if (isBindingPattern(node.name)) {
                write(createParameter2(getGeneratedNameForNode(node), /*initializer*/ undefined, /*location*/ node));
            }
            else if (node.initializer) {
                write(createParameter2(node.name, /*initializer*/ undefined, /*location*/ node));
            }
            else if (!node.dotDotDotToken) {
                // rest parameters are elided, other parameters are included.
                write(node);
            }
        }

        function shouldEmitDefaultValueAssignments(node: FunctionLikeDeclaration) {
            return (node.transformFlags & TransformFlags.ContainsDefaultValueAssignments);
        }

        function emitDefaultValueAssignments(node: FunctionLikeDeclaration, write: (node: Statement) => void) {
            if (!shouldEmitDefaultValueAssignments(node)) {
                return;
            }

            for (let parameter of node.parameters) {
                let { name, initializer, dotDotDotToken } = parameter;

                // A rest parameter cannot have a binding pattern or an initializer,
                // so let's just ignore it.
                if (dotDotDotToken) {
                    continue;
                }

                if (isBindingPattern(name)) {
                    emitDefaultValueAssignmentForBindingPattern(parameter, name, initializer, write);
                }
                else if (initializer) {
                    emitDefaultValueAssignmentForInitializer(parameter, name, initializer, write);
                }
            }
        }

        function emitDefaultValueAssignmentForBindingPattern(parameter: ParameterDeclaration, name: BindingPattern, initializer: Expression, write: (node: Statement) => void): void {
            let tempName = getGeneratedNameForNode(parameter);

            // In cases where a binding pattern is simply '[]' or '{}',
            // we usually don't want to emit a var declaration; however, in the presence
            // of an initializer, we must emit that expression to preserve side effects.
            let hasBindingElements = name.elements.length > 0;
            if (hasBindingElements) {
                let declarations = flattenNode(parameter, emitParameterBindingElements);
                let varDecls = createVariableDeclarationList(declarations);
                let varStmt = createVariableStatement2(varDecls);
                startOnNewLine(varStmt);
                write(varStmt);
            }
            else if (initializer) {
                let initExpr = visitNode(initializer, visitor, isExpressionNode);
                let assignExpr = createAssignmentExpression(tempName, initExpr);
                let assignStmt = createExpressionStatement(assignExpr);
                startOnNewLine(assignStmt);
                write(assignStmt);
            }
        }

        function emitParameterBindingElements(parameter: ParameterDeclaration, write: (node: VariableDeclaration) => void): void {
            flattenParameterDestructuring(transformer, parameter, write, visitor);
        }

        function emitDefaultValueAssignmentForInitializer(parameter: ParameterDeclaration, name: Identifier, initializer: Expression, write: (node: Statement) => void): void {
            name = cloneNode(name);
            let equalityExpr = createStrictEqualityExpression(name, createVoidZeroExpression());
            let initExpr = visitNode(initializer, visitor, isExpressionNode);
            let assignExpr = createAssignmentExpression(name, initExpr);
            let assignStmt = createExpressionStatement(assignExpr);
            let trueStmt = createBlock([assignStmt], /*location*/ undefined, NodeFlags.SingleLine);
            let ifStmt = createIfStatement(equalityExpr, trueStmt);
            startOnNewLine(ifStmt);
            write(ifStmt);
        }

        function shouldEmitRestParameter(node: ParameterDeclaration) {
            return node && node.dotDotDotToken && !(node.flags & NodeFlags.Generated);
        }

        function emitRestParameter(node: FunctionLikeDeclaration, write: (node: Statement) => void): void {
            let lastParam = lastOrUndefined(node.parameters);
            if (!shouldEmitRestParameter(lastParam)) {
                if (node && node.name && (<any>node.name).text === "append") {
                    console.log("no rest in append");
                }
                return;
            }

            // var param = [];
            let name = makeSynthesized(<Identifier>lastParam.name);
            let restIndex = node.parameters.length - 1;
            let paramVarStmt = createVariableStatement3(name, createArrayLiteralExpression([]));
            startOnNewLine(paramVarStmt);
            write(paramVarStmt);

            // for (var _i = restIndex; _i < arguments.length; _i++) {
            let _i = createTempVariable(TempFlags._i);
            let initializerVarDecls = createVariableDeclarationList2(_i, createNumericLiteral2(restIndex));
            let argumentsLength = createPropertyAccessExpression3(createIdentifier("arguments"), "length");
            let condition = createLessThanExpression(_i, argumentsLength);
            let incrementer = createPostfixUnaryExpression(_i, SyntaxKind.PlusPlusToken);

            // param[_i - restIndex] = arguments[_i];
            let arrayOffset = restIndex === 0 ? _i : createSubtractExpression(_i, createNumericLiteral2(restIndex));
            let arrayElement = createElementAccessExpression2(name, arrayOffset);
            let argumentsElement = createElementAccessExpression2(createIdentifier("arguments"), _i);
            let assignExpr = createAssignmentExpression(arrayElement, argumentsElement);
            let assignStmt = createExpressionStatement(assignExpr);
            startOnNewLine(assignStmt);

            let forStmt = createForStatement(initializerVarDecls, condition, incrementer, createBlock([assignStmt]));
            startOnNewLine(forStmt);
            write(forStmt);
        }

        function emitCaptureThisForNodeIfNeeded(node: Node, write: (node: Statement) => void): void {
            if (node.transformFlags & TransformFlags.ContainsCapturedLexicalThis && !isArrowFunction(node)) {
                let thisName = createIdentifier("_this");
                let thisExpr = createThisKeyword();
                let varStmt = createVariableStatement3(thisName, thisExpr);
                startOnNewLine(varStmt);
                write(varStmt);
            }
        }

        function emitMemberFunctions(node: ClassExpression | ClassDeclaration, write: (node: Statement) => void): void {
            for (let member of node.members) {
                if (isSemicolonClassElement(member)) {
                    visitSemicolonClassElement(member, write);
                }
                else if (isMethodDeclaration(member)) {
                    visitClassMethodDeclaration(node, member, write);
                }
                else if (isGetAccessor(member) || isSetAccessor(member)) {
                    let accessors = getAllAccessorDeclarations(node.members, member);
                    if (member === accessors.firstAccessor) {
                        let receiver = getClassMemberPrefix(node, member);
                        emitAccessors(receiver, accessors, /*isStatement*/ true, write);
                    }
                }
            }
        }

        function visitSemicolonClassElement(member: SemicolonClassElement, write: (node: Statement) => void): void {
            let stmt = createEmptyStatement();
            startOnNewLine(stmt);
            write(stmt);
        }

        function visitClassMethodDeclaration(node: ClassExpression | ClassDeclaration, member: MethodDeclaration, write: (node: Statement) => void): void {
            let prefix = getClassMemberPrefix(node, member);
            let propExpr = createMemberAccessForPropertyName(prefix, visitNode(member.name, visitor, isPropertyName));
            let funcExpr = transformFunctionLikeToExpression(member);
            let assignExpr = createAssignmentExpression(propExpr, funcExpr);
            let assignStmt = createExpressionStatement(assignExpr, /*location*/ member);
            startOnNewLine(assignStmt);
            write(assignStmt);
        }

        function emitAccessors(receiver: LeftHandSideExpression, accessors: AllAccessorDeclarations, isStatement: boolean, write: (node: Expression | Statement) => void): void {
            let property = accessors.firstAccessor;
            let propertyName = visitNode(property.name, visitor, isPropertyName);
            let expressionName = createExpressionForPropertyName(propertyName, /*location*/ property.name);
            let getter = accessors.getAccessor && transformFunctionLikeToExpression(accessors.getAccessor, /*location*/ accessors.getAccessor);
            let setter = accessors.setAccessor && transformFunctionLikeToExpression(accessors.setAccessor, /*location*/ accessors.setAccessor);
            let defineCall = createDefinePropertyCall2(receiver, expressionName, getter, setter, /*location*/ property);
            if (isStatement) {
                let statement = createExpressionStatement(defineCall);
                startOnNewLine(statement);
                write(statement);
            }
            else {
                write(defineCall);
            }
        }

        function visitFunctionExpression(node: FunctionExpression, write: (node: Expression) => void): void {
            write(transformFunctionLikeToExpression(node, /*location*/ node, node.name));
        }

        function transformFunctionLikeToExpression(node: FunctionLikeDeclaration, location?: TextRange, name?: Identifier): FunctionExpression {
            let parameters = visitNodes(node.parameters, visitor, isParameter);
            let statements = flattenNode(node, emitFunctionBody);
            let expression = createFunctionExpression2(name, parameters, createBlock(statements), location);
            expression.original = node;
            return expression;
        }

        function visitFunctionDeclaration(node: FunctionDeclaration, write: (node: Statement) => void): void {
            let parameters = visitNodes(node.parameters, visitor, isParameter);
            let statements = flattenNode(node, emitFunctionBody);
            let declaration = createFunctionDeclaration2(node.name, parameters, createBlock(statements), /*location*/ node);
            declaration.original = node;
            write(declaration);
        }

        function emitFunctionBody(node: FunctionLikeDeclaration, write: (node: Statement) => void): void {
            startLexicalEnvironment();
            emitCaptureThisForNodeIfNeeded(node, write);
            emitDefaultValueAssignments(node, write);
            emitRestParameter(node, write);

            let body = node.body;
            if (isBlock(body)) {
                pipeNodes(body.statements, visitor, write);
            }
            else {
                let expr = visitNode(body, visitor, isExpressionNode);
                if (expr) {
                    write(createReturnStatement(expr));
                }
            }
            endLexicalEnvironment(write);
        }

        function visitBinaryExpression(node: BinaryExpression, write: (node: Expression) => void): void {
            // If we are here it is because this is a destructuring assignment.
            flattenDestructuringAssignment(transformer, node, write, visitor);
        }

        function visitVariableStatement(node: VariableStatement, write: (node: Statement) => void): void {
            // TODO(rbuckton): Do we need to handle this? Exports needs to be moved to a module transformer.
            write(accept(node, visitor));
        }

        function visitVariableDeclarationList(node: VariableDeclarationList, write: (node: VariableDeclarationList) => void): void {
            // TODO(rbuckton): let/const
            let declarations = visitNodes(node.declarations, visitVariableDeclaration, isVariableDeclaration);
            write(createVariableDeclarationList(declarations, node));
        }

        function visitVariableDeclaration(node: VariableDeclaration, write: (node: VariableDeclaration) => void): void {
            let name = node.name;
            if (isBindingPattern(name)) {
                flattenVariableDestructuring(transformer, node, write, visitor);
            }
            else {
                let initializer = node.initializer;
                if (!initializer) {
                    // downlevel emit for non-initialized let bindings defined in loops
                    // for (...) {  let x; }
                    // should be
                    // for (...) { var <some-uniqie-name> = void 0; }
                    // this is necessary to preserve ES6 semantic in scenarios like
                    // for (...) { let x; console.log(x); x = 1 } // assignment on one iteration should not affect other iterations
                    let isUninitializedLet =
                        (resolver.getNodeCheckFlags(node) & NodeCheckFlags.BlockScopedBindingInLoop) &&
                        (getCombinedNodeFlags(transformer) & NodeFlags.Let);

                    // NOTE: default initialization should not be added to let bindings in for-in\for-of statements
                    if (isUninitializedLet &&
                        !isForBinding(findAncestorNode(isIterationStatement), node)) {
                        initializer = createVoidZeroExpression();
                    }
                }
                else {
                    initializer = visitNode(initializer, visitor, isExpressionNode);
                }

                write(updateVariableDeclaration(node, name, /*type*/ undefined, initializer));
            }
        }

        function isForBinding(container: IterationStatement, node: VariableDeclaration) {
            if (isForInStatement(container) || isForOfStatement(container)) {
                let initializer = container.initializer;
                if (isVariableDeclarationList(initializer)) {
                    return node === initializer.declarations[0];
                }
            }
            return false;
        }

        function isIterationStatement(node: Node): node is IterationStatement {
            return isForInStatement(node) || isForOfStatement(node) || isForStatement(node) || isDoStatement(node) || isWhileStatement(node);
        }

        function visitForOfStatement(node: ForOfStatement, write: (node: Statement) => void): void {
            // The following ES6 code:
            //
            //    for (let v of expr) { }
            //
            // should be emitted as
            //
            //    for (let _i = 0, _a = expr; _i < _a.length; _i++) {
            //        let v = _a[_i];
            //    }
            //
            // where _a and _i are temps emitted to capture the RHS and the counter,
            // respectively.
            // When the left hand side is an expression instead of a let declaration,
            // the "let v" is not emitted.
            // When the left hand side is a let/const, the v is renamed if there is
            // another v in scope.
            // Note that all assignments to the LHS are emitted in the body, including
            // all destructuring.
            // Note also that because an extra statement is needed to assign to the LHS,
            // for-of bodies are always emitted as blocks.

            let expression = visitNode(node.expression, visitor, isExpressionNode);

            // In the case where the user wrote an identifier as the RHS, like this:
            //
            //     for (let v of arr) { }
            //
            // we don't want to emit a temporary variable for the RHS, just use it directly.

            let rhsIsIdentifier = expression.kind === SyntaxKind.Identifier;
            let counter = createTempVariable(TempFlags._i);
            let rhsReference = rhsIsIdentifier ? <Identifier>expression : createTempVariable(TempFlags.Auto);

            // _i = 0
            let loopInitializer = createVariableDeclarationList([], /*location*/ node.expression);
            loopInitializer.declarations.push(createVariableDeclaration2(counter, createNumericLiteral2(0), /*location*/ node.expression));
            if (!rhsIsIdentifier) {
                // , _a = expr
                loopInitializer.declarations.push(createVariableDeclaration2(rhsReference, expression, /*location*/ node.expression));
            }

            // _i < _a.length;
            let loopCondition = createLessThanExpression(counter, createPropertyAccessExpression3(rhsReference, "length"), /*location*/ node.initializer);

            // _i++)
            let loopIncrementer = createPostfixUnaryExpression(counter, SyntaxKind.PlusPlusToken, /*location*/ node.initializer);

            // Body
            let loopBodyStatements: Statement[] = [];

            // Initialize LHS
            // let v = _a[_i];
            let rhsIterationValue = createElementAccessExpression(rhsReference, counter);
            let initializer = node.initializer;
            if (isVariableDeclarationList(initializer)) {
                let declarations: VariableDeclaration[] = [];
                if (initializer.declarations.length > 0) {
                    let declaration = initializer.declarations[0];
                    if (isBindingPattern(declaration.name)) {
                        // This works whether the declaration is a var, let, or const.
                        // It will use rhsIterationValue _a[_i] as the initializer.
                        pushNode(initializer);
                        pipeNode(declaration, visitVariableDeclaration, declarations);
                        popNode();
                    }
                    else {
                        // The following call does not include the initializer, so we have
                        // to emit it separately.
                        declarations.push(updateVariableDeclaration(declaration, declaration.name, /*type*/ undefined, rhsIterationValue));
                    }
                }
                else {
                    // It's an empty declaration list. This can only happen in an error case, if the user wrote
                    //     for (let of []) {}
                    declarations.push(createVariableDeclaration2(createTempVariable(TempFlags.Auto), rhsIterationValue));
                }

                loopBodyStatements.push(createVariableStatement2(createVariableDeclarationList(declarations), /*location*/ node.initializer));
            }
            else {
                // Initializer is an expression. Emit the expression in the body, so that it's
                // evaluated on every iteration.
                let assignmentExpression: Expression = createAssignmentExpression(initializer, rhsIterationValue);
                if (isDestructuringAssignment(assignmentExpression)) {
                    // This is a destructuring pattern, so call emitDestructuring instead of emit. Calling emit will not work, because it will cause
                    // the BinaryExpression to be passed in instead of the expression statement, which will cause emitDestructuring to crash.
                    assignmentExpression = mapNode(assignmentExpression, visitBinaryExpression);
                }

                loopBodyStatements.push(createExpressionStatement(assignmentExpression, /*location*/ node.initializer));
            }

            let statement = node.statement;
            if (isBlock(statement)) {
                pipeNodes(statement.statements, visitor, loopBodyStatements);
            }
            else {
                pipeNode(statement, visitor, loopBodyStatements);
            }

            write(createForStatement(loopInitializer, loopCondition, loopIncrementer, createBlock(loopBodyStatements), /*location*/ node));
        }

        function visitObjectLiteralExpression(node: ObjectLiteralExpression, write: (node: LeftHandSideExpression) => void): void {
            // We are here because a ComputedPropertyName was used somewhere in the expression.
            let properties = node.properties;
            let numProperties = properties.length;

            // Find the first computed property.
            // Everything until that point can be emitted as part of the initial object literal.
            let numInitialNonComputedProperties = numProperties;
            for (let i = 0, n = properties.length; i < n; i++) {
                if (properties[i].name.kind === SyntaxKind.ComputedPropertyName) {
                    numInitialNonComputedProperties = i;
                    break;
                }
            }

            Debug.assert(numInitialNonComputedProperties !== numProperties);

            // For computed properties, we need to create a unique handle to the object
            // literal so we can modify it without risking internal assignments tainting the object.
            let temp = createTempVariable();
            hoistVariableDeclaration(temp);

            // Write out the first non-computed properties, then emit the rest through indexing on the temp variable.
            let initialProperties = visitNodes(properties, visitor, isObjectLiteralElement, 0, numInitialNonComputedProperties);

            let expressions: Expression[] = [];
            expressions.push(createAssignmentExpression(temp, createObjectLiteralExpression(initialProperties)))
            pipeNodes(properties, (property, write) => emitObjectLiteralElementAsExpression(property, write, node, temp), expressions, numInitialNonComputedProperties);

            // We need to clone the temporary identifier so that we can write it on a
            // new line
            let clone = cloneNode(temp);
            if (node.flags & NodeFlags.MultiLine) {
                startOnNewLine(clone);
            }

            expressions.push(clone);

            write(createParenthesizedExpression(inlineExpressions(expressions)));
        }

        function visitMethodDeclaration(node: MethodDeclaration, write: (node: ObjectLiteralElement) => void): void {
            let name = node.name;
            if (isIdentifier(name)) {
                let funcExpr = transformFunctionLikeToExpression(node, node);
                write(createPropertyAssignment(node.name, funcExpr, node));
            }
        }

        function emitObjectLiteralElementAsExpression(property: ObjectLiteralElement, write: (node: Expression) => void, node: ObjectLiteralExpression, receiver: Identifier): void {
            if (isGetAccessor(property) || isSetAccessor(property)) {
                let accessors = getAllAccessorDeclarations(node.properties, property);
                if (property !== accessors.firstAccessor) {
                    return;
                }

                emitAccessors(receiver, accessors, /*isStatement*/ false, write);
            }
            else {
                let propertyName = visitNode(property.name, visitor, isPropertyName);
                let qualifiedName = createMemberAccessForPropertyName(receiver, propertyName);

                let initializer: Expression;
                if (isPropertyAssignment(property)) {
                    initializer = visitNode(property.initializer, visitor, isExpressionNode);
                }
                else if (isShorthandPropertyAssignment(property)) {
                    initializer = cloneNode(property.name);
                }
                else if (isMethodDeclaration(property)) {
                    initializer = transformFunctionLikeToExpression(property, /*location*/ property);
                }
                else {
                    Debug.fail("ObjectLiteralElement type not accounted for: " + property.kind);
                }

                let assignment = createAssignmentExpression(qualifiedName, initializer);
                if (node.flags & NodeFlags.MultiLine) {
                    startOnNewLine(assignment);
                }
                write(assignment);
            }
        }

        function visitShorthandPropertyAssignment(node: ShorthandPropertyAssignment, write: (node: ObjectLiteralElement) => void): void {
            let property = createPropertyAssignment(node.name, cloneNode(node.name), /*location*/ node);
            write(property);
        }

        function visitArrayLiteralExpression(node: ArrayLiteralExpression, write: (node: LeftHandSideExpression) => void): void {
            // We are here either because SuperKeyword was used somewhere in the expression, or
            // because we contain a SpreadElementExpression.
            if (forEach(node.elements, isSpreadElementExpression)) {
                write(spreadElements(node.elements, /*needsUniqueCopy*/ true));
            }
            else {
                // We don't handle SuperKeyword here, so fall back.
                write(accept(node, visitor));
            }
        }

        function visitCallExpression(node: CallExpression, write: (node: LeftHandSideExpression) => void): void {
            // We are here either because SuperKeyword was used somewhere in the expression, or
            // because we contain a SpreadElementExpression.
            if (node.transformFlags & TransformFlags.ContainsSpreadElementExpression) {
                emitCallWithSpread(node, write);
            }
            else {
                Debug.assert(
                    node.expression.kind === SyntaxKind.SuperKeyword ||
                    node.expression.kind === SyntaxKind.PropertyAccessExpression &&
                    (<PropertyAccessExpression>node.expression).expression.kind === SyntaxKind.SuperKeyword);

                let expression = visitNode(node.expression, visitor, isExpressionNode);
                let container = getThisContainer(transformer, /*includeArrowFunctions*/ true);
                let thisArg = isArrowFunction(container) ? createIdentifier("_this") : createThisKeyword();
                let args = visitNodes(node.arguments, visitor, isExpressionNode);
                let callCall = createCallCall(expression, thisArg, args, /*location*/ node);
                write(callCall);
            }
        }

        function emitCallWithSpread(node: CallExpression, write: (node: LeftHandSideExpression) => void): void {
            let callee = skipParenthesis(node.expression);
            let expression = callee;
            let target: Expression;
            if (isPropertyAccessExpression(callee)) {
                // Target will be emitted as "this" argument.
                ({ target, expression } = visitCallTarget(callee.expression));
                expression = createPropertyAccessExpression2(expression, callee.name);
            }
            else if (isElementAccessExpression(callee)) {
                // target will be emitted as "this" argument.
                ({ target, expression } = visitCallTarget(callee.expression));
                expression = createElementAccessExpression2(expression, visitNode(callee.argumentExpression, visitor, isExpressionNode));
            }
            else if (isSuperKeyword(callee)) {
                target = createThisKeyword(/*location*/ callee);
                expression = createIdentifier("_super");
            }
            else {
                target = createVoidZeroExpression();
                expression = visitNode(callee, visitor, isExpressionNode);
            }

            let argumentsArray = spreadElements(node.arguments, /*needsUniqueCopy*/ false);
            let applyCall = createApplyCall(expression, target, argumentsArray);
            write(applyCall);
        }

        function visitNewExpression(node: NewExpression, write: (node: LeftHandSideExpression) => void): void {
            // We are here either because SuperKeyword was used somewhere in the expression, or
            // because we contain a SpreadElementExpression.
            if (forEach(node.arguments, isSpreadElementExpression)) {
                let { target, expression } = visitCallTarget(node.expression);
                let argumentsArray = spreadElements(node.arguments, /*needsUniqueCopy*/ false, createVoidZeroExpression());
                let bindApply = createApplyCall(createPropertyAccessExpression3(expression, "bind"), target, argumentsArray);
                write(createNewExpression(createParenthesizedExpression(bindApply), /*typeArguments*/ undefined, []));
                return;
            }
            else {
                // We have nothing to do for SuperKeyword, so fallback.
                write(accept(node, visitor));
            }
        }

        function skipParenthesis(node: Expression) {
            while (isParenthesizedExpression(node) || isTypeAssertionExpression(node) || isAsExpression(node)) {
                node = (<ParenthesizedExpression | AssertionExpression>node).expression;
            }
            return node;
        }

        function visitCallTarget(node: LeftHandSideExpression) {
            let expression = visitNode(node, visitor, isLeftHandSideExpression);
            let target: PrimaryExpression;
            if (isIdentifier(expression)) {
                target = makeSynthesized(<PrimaryExpression>expression);
            }
            else if (isThisKeyword(node) || isSuperKeyword(node)) {
                target = createThisKeyword();
                target.original = node;
            }
            else {
                let temp = createTempVariable();
                hoistVariableDeclaration(temp);
                target = temp;
                expression = createParenthesizedExpression(createAssignmentExpression(target, expression));
            }

            return { expression, target };
        }

        function spreadElements(elements: Expression[], needsUniqueCopy: boolean, leadingExpression?: Expression) {
            let segments: Expression[] = [];
            if (leadingExpression) {
                segments.push(leadingExpression);
            }

            let length = elements.length;
            let start = 0;
            for (let i = 0; i < length; i++) {
                let element = elements[i];
                if (isSpreadElementExpression(element)) {
                    if (i > start) {
                        segments.push(createArrayLiteralExpression(visitNodes(elements.slice(start, i), visitor, isExpressionNode)));
                    }

                    let expression = visitNode(element.expression, visitor, isExpressionNode);
                    segments.push(expression);
                    start = i + 1;
                }
            }

            if (start < length) {
                segments.push(createArrayLiteralExpression(visitNodes(elements.slice(start, length), visitor, isExpressionNode)));
            }

            if (segments.length === 1) {
                if (!leadingExpression && needsUniqueCopy && isSpreadElementExpression(elements[0])) {
                    return createSliceCall(segments[0]);
                }

                return parenthesizeForAccess(segments[0]);
            }

            // Rewrite using the pattern <segment0>.concat(<segment1>, <segment2>, ...)
            return createConcatCall(segments.shift(), segments);
        }

        function visitTemplateLiteral(node: LiteralExpression, write: (node: LeftHandSideExpression) => void): void {
            write(createStringLiteral(node.text));
        }

        function visitTaggedTemplateExpression(node: TaggedTemplateExpression, write: (node: LeftHandSideExpression) => void): void {
            // Visit the tag expression
            let tag = visitNode(node.tag, visitor, isExpressionNode);

            // Allocate storage for the template site object
            let templateObj = createTempVariable();
            hoistVariableDeclaration(templateObj);

            let rawObj = createPropertyAccessExpression3(templateObj, "raw");

            // Build up the template arguments and the raw and cooked strings for the template.
            let templateArguments: Expression[] = [templateObj];
            let cookedStrings: Expression[] = [];
            let rawStrings: Expression[] = [];
            let template = node.template;
            if (isNoSubstitutionTemplateLiteral(template)) {
                cookedStrings.push(createStringLiteral(template.text));
                rawStrings.push(getRawLiteral(template));
            }
            else {
                cookedStrings.push(createStringLiteral(template.head.text));
                rawStrings.push(getRawLiteral(template.head));
                pushNode(template);
                for (let templateSpan of template.templateSpans) {
                    cookedStrings.push(createStringLiteral(templateSpan.literal.text));
                    rawStrings.push(getRawLiteral(templateSpan.literal));
                    templateArguments.push(mapNode(templateSpan, visitExpressionOfTemplateSpan));
                }
                popNode();
            }

            let cookedArray = createArrayLiteralExpression(cookedStrings);
            let rawArray = createArrayLiteralExpression(rawStrings);

            let expressions: Expression[] = [];
            expressions.push(createAssignmentExpression(templateObj, cookedArray));
            expressions.push(createAssignmentExpression(rawObj, rawArray));
            expressions.push(createCallExpression2(tag, templateArguments));
            write(createParenthesizedExpression(inlineExpressions(expressions)));
        }

        function getRawLiteral(node: LiteralExpression) {
            // Find original source text, since we need to emit the raw strings of the tagged template.
            // The raw strings contain the (escaped) strings of what the user wrote.
            // Examples: `\n` is converted to "\\n", a template string with a newline to "\n".
            let text = getSourceTextOfNodeFromSourceFile(currentSourceFile, node);

            // text contains the original source, it will also contain quotes ("`"), dolar signs and braces ("${" and "}"),
            // thus we need to remove those characters.
            // First template piece starts with "`", others with "}"
            // Last template piece ends with "`", others with "${"
            let isLast = node.kind === SyntaxKind.NoSubstitutionTemplateLiteral || node.kind === SyntaxKind.TemplateTail;
            text = text.substring(1, text.length - (isLast ? 1 : 2));

            // Newline normalization:
            // ES6 Spec 11.8.6.1 - Static Semantics of TV's and TRV's
            // <CR><LF> and <CR> LineTerminatorSequences are normalized to <LF> for both TV and TRV.
            text = text.replace(/\r\n?/g, "\n");
            text = escapeString(text);
            return createStringLiteral(text);
        }

        function visitExpressionOfTemplateSpan(node: TemplateSpan, write: (node: Expression) => void): void {
            write(visitNode(node.expression, visitor, isExpressionNode));
        }

        function visitTemplateExpression(node: TemplateExpression, write: (node: Expression) => void): void {
            let expressions: Expression[] = [];

            if (shouldEmitTemplateHead(node)) {
                pipeNode(node.head, visitTemplateLiteral, expressions);
            }

            pipeNodes(node.templateSpans, emitTemplateSpan, expressions);

            let expression = reduceLeft(expressions, createAddExpression);
            if (templateNeedsParens(node)) {
                expression = createParenthesizedExpression(expression);
            }

            write(expression);
        }

        function emitTemplateSpan(node: TemplateSpan, write: (node: Expression) => void): void {
            // Check if the expression has operands and binds its operands less closely than binary '+'.
            // If it does, we need to wrap the expression in parentheses. Otherwise, something like
            //    `abc${ 1 << 2 }`
            // becomes
            //    "abc" + 1 << 2 + ""
            // which is really
            //    ("abc" + 1) << (2 + "")
            // rather than
            //    "abc" + (1 << 2) + ""
            let expression = visitNode(node.expression, visitor, isExpressionNode);
            let needsParens = !isParenthesizedExpression(expression)
                && comparePrecedenceToBinaryPlus(expression) !== Comparison.GreaterThan;

            if (needsParens) {
                expression = createParenthesizedExpression(expression);
            }

            write(expression);

            // Only emit if the literal is non-empty.
            // The binary '+' operator is left-associative, so the first string concatenation
            // with the head will force the result up to this point to be a string.
            // Emitting a '+ ""' has no semantic effect for middles and tails.
            if (node.literal.text.length !== 0) {
                pipeNode(node.literal, visitTemplateLiteral, write);
            }
        }

        function shouldEmitTemplateHead(node: TemplateExpression) {
            // If this expression has an empty head literal and the first template span has a non-empty
            // literal, then emitting the empty head literal is not necessary.
            //     `${ foo } and ${ bar }`
            // can be emitted as
            //     foo + " and " + bar
            // This is because it is only required that one of the first two operands in the emit
            // output must be a string literal, so that the other operand and all following operands
            // are forced into strings.
            //
            // If the first template span has an empty literal, then the head must still be emitted.
            //     `${ foo }${ bar }`
            // must still be emitted as
            //     "" + foo + bar

            // There is always atleast one templateSpan in this code path, since
            // NoSubstitutionTemplateLiterals are directly emitted via emitLiteral()
            Debug.assert(node.templateSpans.length !== 0);

            return node.head.text.length !== 0 || node.templateSpans[0].literal.text.length === 0;
        }

        function templateNeedsParens(template: TemplateExpression) {
            let parentNode = getParentNode();
            if (isExpressionNode(parentNode)) {
                switch (parentNode.kind) {
                    case SyntaxKind.CallExpression:
                    case SyntaxKind.NewExpression:
                        return (<CallExpression>parentNode).expression === template;

                    case SyntaxKind.TaggedTemplateExpression:
                    case SyntaxKind.ParenthesizedExpression:
                        return false;

                    default:
                        return comparePrecedenceToBinaryPlus(<Expression>parentNode) !== Comparison.LessThan;
                }
            }

            return false;
        }

        function visitSuperKeyword(node: PrimaryExpression, write: (node: LeftHandSideExpression) => void): void {
            let _super: LeftHandSideExpression = createIdentifier("_super");
            if (resolver.getNodeCheckFlags(node) & NodeCheckFlags.SuperInstance) {
                _super = createPropertyAccessExpression3(createIdentifier("_super"), "prototype");
            }

            write(_super);
        }

        function visitExpressionStatement(node: ExpressionStatement, write: (node: Statement) => void): void {
            if (node.flags & NodeFlags.Generated) {
                write(createDefaultSuperCall());
            }
            else {
                // TODO(rbuckton): Is there any reason we should hit this branch?
                write(accept(node, visitor));
            }
        }

        function visitSourceFileNode(node: SourceFile, write: (node: SourceFile) => void): void {
            let statements = flattenNode(node, emitSourceFileBody);
            write(updateSourceFileNode(node, statements, node.endOfFileToken));
        }

        function emitSourceFileBody(node: SourceFile, write: (node: Statement) => void): void {
            let statementOffset = writePrologueDirectives(node.statements, write);
            emitCaptureThisForNodeIfNeeded(node, write);
            pipeNodes(node.statements, visitSourceElement, write, statementOffset);
        }

        function visitSourceElement(node: Statement, write: (node: Statement) => void): void {
            write(visitNode(node, visitor, isStatementNode));
        }

        function substituteBindingIdentifierWithFallback(node: Identifier): Identifier {
            let substitute = noSubstitution[getNodeId(node)] ? node : substituteBindingIdentifier(node);
            return savedBindingIdentifierSubstitution ? savedBindingIdentifierSubstitution(substitute) : substitute;
        }

        function substituteBindingIdentifier(node: Identifier): Identifier {
            if (isNameOfNestedRedeclaration(node)) {
                let name = getGeneratedNameForNode(node);
                noSubstitution[getNodeId(name)] = true;
                return name;
            }
            return node;
        }

        function substituteExpressionWithFallback(node: Expression): Expression {
            let substitute = noSubstitution[getNodeId(node)] ? node : substituteExpression(node);
            return savedExpressionSubstitution ? savedExpressionSubstitution(substitute) : substitute;
        }

        function substituteExpression(node: Expression): Expression {
            if (isIdentifier(node)) {
                return substituteExpressionIdentifier(node);
            }
            else if (isThisKeyword(node)) {
                return substituteThisKeyword(node);
            }
            return node;
        }

        function substituteExpressionIdentifier(node: Identifier): Identifier {
            let declaration = resolver.getReferencedNestedRedeclaration(node);
            if (declaration) {
                return getGeneratedNameForNode(declaration.name);
            }
            return node;
        }

        function substituteThisKeyword(node: PrimaryExpression): PrimaryExpression {
            let originalNode = getOriginalNode(node);
            let container = getThisContainer(originalNode, /*includeArrowFunctions*/ true);
            if (isArrowFunction(container)) {
                return createIdentifier("_this");
            }
            return node;
        }

        function isNameOfNestedRedeclaration(node: Identifier) {
            let parent = transformer.getParentNode();
            switch (parent.kind) {
                case SyntaxKind.BindingElement:
                case SyntaxKind.ClassDeclaration:
                case SyntaxKind.EnumDeclaration:
                case SyntaxKind.VariableDeclaration:
                    return (<Declaration>parent).name === node
                        && resolver.isNestedRedeclaration(<Declaration>parent);
            }
            return false;
        }

        function createDefaultSuperCall() {
            let superName = createIdentifier("_super");
            let thisExpr = createThisKeyword();
            let argumentsName = createIdentifier("arguments");
            let applyExpr = createApplyCall(superName, thisExpr, argumentsName);
            let statement = createExpressionStatement(applyExpr);
            startOnNewLine(statement);
            return statement;
        }

        function getDeclarationName(node: ClassExpression | ClassDeclaration | FunctionDeclaration) {
            return node.name ? makeSynthesized(node.name) : getGeneratedNameForNode(node);
        }

        function getClassMemberPrefix(node: ClassExpression | ClassDeclaration, member: ClassElement) {
            let expression = getDeclarationName(node);
            return member.flags & NodeFlags.Static ? expression : createPropertyAccessExpression3(expression, "prototype");
        }
    }
}