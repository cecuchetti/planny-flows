"""Application layer: factory, context, lifespan and error handlers.

Deliberately re-exports nothing. Importing a submodule runs this file, so a
re-export here would pull the factory — and therefore the module registry and
every router — into any import of ``planny_api.app.<something>``, which closed a
circular import with ``planny_api.dependencies``.

Import what you need from where it lives::

    from planny_api.app.context import AppContext
    from planny_api.app.factory import create_app
"""
