// Copyright IBM Corp. 2016,2017. All Rights Reserved.
// Node module: loopback-connector-dashdb
// This file is licensed under the Artistic License 2.0.
// License text available at https://opensource.org/licenses/Artistic-2.0

'use strict';

var g = require('./globalize');

module.exports = mixinDiscovery;

/**
* @param {DASHDB} DASHDB connector class
* @param {Object} dashdb
*/
function mixinDiscovery(DASHDB, dashdb) {
  var async = require('async');

  DASHDB.prototype.paginateSQL = function(sql, orderBy, options) {
    options = options || {};
    var limitClause = '';
    if (options.offset || options.skip || options.limit) {
      // Offset starts from 0
      var offset = Number(options.offset || options.skip || 0);
      if (isNaN(offset)) {
        offset = 0;
      }
      if (options.limit) {
        var limit = Number(options.limit);
        if (isNaN(limit)) {
          limit = 0;
        }
        limitClause = ' FETCH FIRST ' + limit + ' ROWS ONLY';
      }
    }
    if (!orderBy) {
      sql += ' ORDER BY ' + orderBy;
    }

    // return sql + limitClause;
    return sql + limitClause;
  };

  /**
   * Build sql for listing schemas (databases in DASHDB)
   *
   * @param {Object} [options]
   * @returns {string} sql
   */
  DASHDB.prototype.buildQuerySchemas = function(options) {
    var sql = 'SELECT definer as "catalog",' +
      ' schemaname as "schema"' +
      ' FROM syscat.schemata';

    return this.paginateSQL(sql, 'schema_name', options);
  };

  /**
   * Build sql for listing tables
   *
   * @param {Object} options
   * @returns {string} sql
   */
  DASHDB.prototype.buildQueryTables = function(options) {
    var sqlTables = null;
    var schema = options.owner || options.schema;

    if (options.all && !schema) {
      sqlTables = this.paginateSQL('SELECT \'table\' AS "type",' +
        ' tabname AS "name", tabschema AS "owner", property as "property"' +
        ' FROM syscat.tables where substr(property,20,1) NOT LIKE \'Y\'',
      'table_schema, table_name', options);
    } else if (schema) {
      sqlTables = this.paginateSQL('SELECT \'table\' AS "type",' +
        ' tabname AS "name", tabschema AS "schema", property as "property"' +
        ' FROM syscat.tables' +
        ' WHERE tabschema=\'' + schema + '\' AND' +
        ' SUBSTR(property, 20, 1) NOT LIKE \'Y\'',
      'table_schema, table_name', options);
    } else {
      sqlTables = this.paginateSQL('SELECT \'table\' AS "type",' +
        ' tabname AS "name", ' +
        ' tabschema AS "owner", property as "property" FROM syscat.tables' +
        ' WHERE tabschema = CURRENT USER AND' +
        ' SUBSTR(property, 20, 1) NOT LIKE \'Y\'',
      'tabname', options);
    }

    return sqlTables;
  };

  /**
   * Build sql for listing views
   *
   * @param {Object} options
   * @returns {string} sql
   */
  DASHDB.prototype.buildQueryViews = function(options) {
    var sqlViews = null;
    if (options.views) {
      var schema = options.owner || options.schema;

      if (options.all && !schema) {
        sqlViews = this.paginateSQL('SELECT \'view\' AS "type",' +
          ' tabname AS "name",' +
          ' tabschema AS "owner"' +
          ' FROM syscat.tables',
        'tabschema, tabname', options);
      } else if (schema) {
        sqlViews = this.paginateSQL('SELECT \'view\' AS "type",' +
          ' tabname AS "name",' +
          ' tabschema AS "owner"' +
          ' FROM syscat.tables' +
          ' WHERE tabschema=\'' + schema + '\'',
        'tabschema, tabname', options);
      } else {
        sqlViews = this.paginateSQL('SELECT \'view\' AS "type",' +
          ' tabname AS "name",' +
          ' tabschema AS "owner"' +
          ' FROM syscat.tables',
        'tabname', options);
      }
    }

    return sqlViews;
  };

  /**
   * Normalize the arguments
   *
   * @param {string} table
   * @param {Object} [options]
   * @param {Function} [cb]
   */
  DASHDB.prototype.getArgs = function(table, options, cb) {
    // if ('string' !== (typeof table || !table)) {
    //   throw new Error('table is a required string argument: ' + table);
    // }
    options = options || {};
    // if (!cb && 'function' === (typeof options)) {
    //   cb = options;
    //   options = {};
    // }
    if (typeof options !== 'object') {
      throw new Error(g.f('options must be an object: %j', options));
    }

    return {
      schema: options.owner || options.schema,
      table: table,
      options: options,
      cb: cb,
    };
  };

  /**
   * Build the sql statement to query columns for a given table
   *
   * @param {string} schema
   * @param {string} table
   * @returns {string} The sql statement
   */
  DASHDB.prototype.buildQueryColumns = function(schema, table) {
    var sql = null;
    if (schema) {
      sql = this.paginateSQL('SELECT tabschema AS "owner",' +
        ' tabname AS "tableName",' +
        ' colname AS "columnName",' +
        ' typename AS "dataType",' +
        ' length AS "dataLength",' +
        // ' numeric_precision AS "dataPrecision",' +
        ' scale AS "dataScale",' +
        ' (CASE WHEN nulls = \'Y\' THEN 1 ELSE 0 END) AS "nullable"' +
        ' FROM syscat.columns' +
        ' WHERE TRIM(tabschema) = \'' + schema + '\'' +
        (table ? ' AND TRIM(tabname) = \'' + table + '\'' : ''),
      'tabname, colno', {});
    } else {
      sql = this.paginateSQL('SELECT tabschema AS "owner",' +
        ' tabname AS "tableName",' +
        ' colname AS "columnName",' +
        ' typename AS "dataType",' +
        ' length AS "dataLength",' +
        // ' numeric_precision AS "dataPrecision",' +
        ' scale AS "dataScale",' +
        ' (CASE WHEN nulls = \'Y\' THEN 1 ELSE 0 END) AS "nullable"' +
        ' FROM syscat.columns' +
        (table ? ' WHERE TRIM(tabname)="' + table + '"' : ''),
      'tabname, ordinal_position', {});
    }

    return sql;
  };

  /**
   * Build the sql statement for querying primary keys of a given table
   *
   * @param {string} schema
   * @param {string} table
   * @returns {string}
   */
  DASHDB.prototype.buildQueryPrimaryKeys = function(schema, table) {
    var sql = 'SELECT tabschema AS "owner",' +
      ' tabname AS "tableName",' +
      ' colname AS "columnName",' +
      ' colseq AS "keySeq",' +
      ' constname AS "pkName"' +
      ' FROM syscat.keycoluse' +
      ' WHERE constname = \'PRIMARY\'';

    if (schema) {
      sql += ' AND tabschema = \'' + schema + '\'';
    }
    if (table) {
      sql += ' AND tabname = \'' + table + '\'';
    }
    sql += ' ORDER BY' +
      ' tabschema, constname, tabname, colseq';

    return sql;
  };

  /**
   * Build the sql statement for querying foreign keys of a given table
   *
   * @param {string} schema
   * @param {string} table
   * @returns {string}
   */
  DASHDB.prototype.buildQueryForeignKeys = function(schema, table) {
    var sql =
      'SELECT tabschema AS "fkOwner",' +
      ' constname AS "fkName",' +
      ' tabname AS "fkTableName",' +
      ' reftabschema AS "pkOwner", \'PRIMARY\' AS "pkName",' +
      ' reftabname AS "pkTableName",' +
      ' refkeyname AS "pkColumnName"' +
      ' FROM syscat.references';

    if (schema || table) {
      sql += ' WHERE';
      if (schema) {
        sql += ' tabschema LIKE \'' + schema + '\'';
      }
      if (table) {
        sql += ' AND tabname LIKE \'"' + table + '\'';
      }
    }

    return sql;
  };

  /**
   * Retrieves a description of the foreign key columns that reference the
   *
   * given table's primary key columns (the foreign keys exported by a table).
   * They are ordered by fkTableOwner, fkTableName, and keySeq.
   *
   * @param {string} schema
   * @param {string} table
   * @returns {string}
   */
  DASHDB.prototype.buildQueryExportedForeignKeys = function(schema, table) {
    var sql = 'SELECT a.constraint_name AS "fkName",' +
      ' a.tabschema AS "fkOwner",' +
      ' a.tabname AS "fkTableName",' +
      ' a.colname AS "fkColumnName",' +
      ' NULL AS "pkName",' +
      ' a.referenced_table_schema AS "pkOwner",' +
      ' a.referenced_table_name AS "pkTableName",' +
      ' a.referenced_column_name AS "pkColumnName"' +
      ' FROM information_schema.key_column_usage a' +
      ' WHERE a.position_in_unique_constraint IS NOT NULL';
    if (schema) {
      sql += ' AND a.referenced_table_schema="' + schema + '"';
    }
    if (table) {
      sql += ' AND a.referenced_table_name="' + table + '"';
    }
    sql += ' ORDER BY a.table_schema, a.table_name, a.ordinal_position';

    return sql;
  };

  DASHDB.prototype.buildPropertyType = function(columnDefinition) {
    var db2Type = columnDefinition.dataType;
    var dataLength = columnDefinition.dataLength;

    var type = db2Type.toUpperCase();
    switch (type) {
      case 'CHAR':
        if (dataLength === 1) {
          // Treat char(1) as boolean
          return 'Boolean';
        } else {
          return 'String';
        }
        break;
      case 'VARCHAR':
      case 'TINYTEXT':
      case 'MEDIUMTEXT':
      case 'LONGTEXT':
      case 'TEXT':
      case 'ENUM':
      case 'SET':
        return 'String';
      case 'TINYBLOB':
      case 'MEDIUMBLOB':
      case 'LONGBLOB':
      case 'BLOB':
      case 'BINARY':
      case 'VARBINARY':
      case 'BIT':
        return 'Binary';
      case 'TINYINT':
      case 'SMALLINT':
      case 'INT':
      case 'INTEGER':
      case 'MEDIUMINT':
      case 'YEAR':
      case 'FLOAT':
      case 'DOUBLE':
      case 'BIGINT':
        return 'Number';
      case 'DATE':
      case 'TIMESTAMP':
      case 'DATETIME':
        return 'Date';
      case 'POINT':
        return 'GeoPoint';
      default:
        return 'String';
    }
  };

  DASHDB.prototype.getDefaultSchema = function() {
    return process.env['USER'];
    // if (this.dataSource && this.dataSource.settings &&
    //   this.dataSource.settings.database) {
    //   return this.dataSource.settings.database;
    // }
    // return undefined;
  };

  DASHDB.prototype.setDefaultOptions = function(options) {

  };

  DASHDB.prototype.setNullableProperty = function(r) {
    r.nullable = r.nullable ? 'Y' : 'N';
  };
}
